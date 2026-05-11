import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ActivationState,
  KnowledgeDraft,
  appendTurns,
  getStep,
  loadProspect,
  nowIso,
  reviseWithChat,
  saveActivationState,
  setStep,
} from "@/lib/crm-activation";
import { buildKnowledgeChunks } from "@/lib/knowledge-chunks";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are helping an admin curate the knowledge base for a med spa's AI receptionist before it goes live. Each chunk has:
- title: short descriptor (≤80 chars)
- content: the actual text the receptionist will retrieve and use
- category: one of "services" | "pricing" | "policies" | "faq" | "general"

Chunks become RAG documents — each is embedded and searched independently, so each one should stand alone (don't reference "see above"). Pricing should sit in pricing-category chunks. Procedure chunks may also be category:pricing if the price is included.

When the user asks for a change, revise just the chunk(s) they mention and return the FULL list (don't drop unrelated chunks). Common requests:
- "add HydraFacial $200" → append a procedure chunk
- "remove the deposit chunk" → drop that chunk
- "the FAQ for cancellations is wrong, here's the new text..." → edit that chunk's content
- "shorten the pricing chunks"

Return the entire chunks array every time.`;

interface KnowledgeBody {
  action?: "draft" | "chat" | "commit" | "rebuild";
  message?: string;
}

function warningsFor(prospect: Record<string, unknown>): string[] {
  const w: string[] = [];
  if (!Array.isArray(prospect.procedures) || (prospect.procedures as unknown[]).length === 0) {
    w.push("No procedures researched — knowledge base will be light on services.");
  }
  if (!prospect.business_hours || Object.keys(prospect.business_hours as object).length === 0) {
    w.push("No business hours — receptionist won't be able to answer 'are you open' questions.");
  }
  if (!Array.isArray(prospect.providers) || (prospect.providers as unknown[]).length === 0) {
    w.push("No providers — receptionist can't introduce staff by name.");
  }
  if (!prospect.pricing_notes && !(Array.isArray(prospect.procedures) && (prospect.procedures as Array<{ price?: unknown }>).some((p) => p.price != null))) {
    w.push("No pricing info anywhere — pricing questions will fall back to 'we'll get back to you'.");
  }
  return w;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as KnowledgeBody;
  const action = body.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const prospect = await loadProspect(id);
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const state: ActivationState = (prospect.activation_state as ActivationState) ?? {};
  const step = getStep<KnowledgeDraft>(state, "knowledge");

  if (action === "draft" || action === "rebuild") {
    // `rebuild` regenerates from prospect fields, useful if the prospect was
    // re-researched after the initial draft. `draft` is idempotent.
    if (action === "draft" && step.draft) return NextResponse.json({ step });
    const seeded: typeof step = {
      ...step,
      draft: {
        chunks: buildKnowledgeChunks(prospect),
        warnings: warningsFor(prospect),
      },
    };
    const next = setStep(state, "knowledge", seeded);
    await saveActivationState(id, next);
    return NextResponse.json({ step: seeded });
  }

  if (action === "chat") {
    if (!body.message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (!step.draft) return NextResponse.json({ error: "no draft yet — call action:draft first" }, { status: 400 });

    let revised: KnowledgeDraft;
    let reply: string;
    try {
      const result = await reviseWithChat<KnowledgeDraft>({
        systemPrompt: SYSTEM_PROMPT,
        currentDraft: step.draft,
        history: step.chat,
        userMessage: body.message,
      });
      revised = result.revised;
      reply = result.reply;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }

    // Sanity: clamp categories to allowed set, drop chunks with no content.
    const ALLOWED = new Set(["services", "pricing", "policies", "faq", "general"]);
    const cleanChunks = (revised.chunks ?? [])
      .filter((c) => c && c.title && c.content)
      .map((c) => ({
        title: String(c.title).slice(0, 120),
        content: String(c.content),
        category: ALLOWED.has(c.category) ? c.category : ("general" as const),
      }));
    const cleaned: KnowledgeDraft = { chunks: cleanChunks, warnings: step.draft.warnings };

    const updated = appendTurns(
      { ...step, draft: cleaned },
      [
        { role: "user", content: body.message, at: nowIso() },
        { role: "assistant", content: reply, at: nowIso() },
      ]
    );
    const next = setStep(state, "knowledge", updated);
    await saveActivationState(id, next);
    return NextResponse.json({ step: updated, reply });
  }

  if (action === "commit") {
    if (!step.draft) return NextResponse.json({ error: "no draft to commit" }, { status: 400 });
    if (!prospect.tenant_id) return NextResponse.json({ error: "Activate the tenant step first" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY missing — can't embed chunks" }, { status: 500 });
    }

    // Wipe any KB rows already inserted by a previous commit so re-running
    // this step doesn't accumulate stale chunks. The page guards against
    // accidental re-commit by showing committed_at, but this makes it safe.
    if (step.committed_at) {
      await supabaseAdmin
        .from("knowledge_base_documents")
        .delete()
        .eq("tenant_id", prospect.tenant_id);
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let inserted = 0;
    const failures: string[] = [];
    // Cap at 30 chunks to bound the OpenAI call count + cost. Same cap as
    // demo-provisioner. The user can curate down via chat before committing.
    for (const chunk of step.draft.chunks.slice(0, 30)) {
      try {
        const emb = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunk.content,
        });
        const { error } = await supabaseAdmin.from("knowledge_base_documents").insert({
          tenant_id: prospect.tenant_id,
          title: chunk.title,
          content: chunk.content,
          category: chunk.category,
          embedding: emb.data[0].embedding,
        });
        if (error) failures.push(`${chunk.title}: ${error.message}`);
        else inserted += 1;
      } catch (e) {
        failures.push(`${chunk.title}: ${(e as Error).message}`);
      }
    }

    const updated = {
      ...step,
      committed_at: nowIso(),
      chunks_inserted: inserted,
    };
    await saveActivationState(id, setStep(state, "knowledge", updated));
    return NextResponse.json({ step: updated, inserted, failures });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
