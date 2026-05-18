import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type Category = "providers" | "hours" | "procedures" | "faqs" | "policies" | "auto";

interface Body {
  url?: string;
  category?: Category;
}

const VALID_CATEGORIES: Category[] = ["providers", "hours", "procedures", "faqs", "policies", "auto"];

// Quick HTML-to-text strip — keeps text content, drops scripts/styles/markup.
// Not a real DOM parser; good enough for feeding text to Claude.
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Per-category tool schema. Mirrors the canonical shapes used in the rest of
// the codebase (research agent + activation) so the imported data needs no
// translation downstream.
function buildExtractTool(category: Category): Anthropic.Tool {
  const dayShape = {
    type: ["object", "null"] as unknown as "object",
    properties: {
      open:  { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      close: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    },
    required: ["open", "close"],
    additionalProperties: false,
  };
  const hoursShape = {
    type: "object" as const,
    description: "Per-day hours. Each day MUST be {open:'HH:MM', close:'HH:MM'} in 24h or null when closed. Convert '9 AM-6 PM' to {open:'09:00', close:'18:00'}.",
    properties: Object.fromEntries(
      ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((d) => [d, dayShape])
    ),
    additionalProperties: false,
  };
  const providersShape = {
    type: "array" as const,
    items: {
      type: "object",
      properties: {
        name:        { type: "string" },
        title:       { type: "string" },
        specialties: { type: "array", items: { type: "string" } },
        bio:         { type: "string" },
        source_url:  { type: "string" },
      },
      required: ["name"],
    },
  };
  const proceduresShape = {
    type: "array" as const,
    items: {
      type: "object",
      properties: {
        name:         { type: "string" },
        description:  { type: "string" },
        duration_min: { type: "number" },
        price:        { type: "string" },
        source_url:   { type: "string" },
      },
      required: ["name"],
    },
  };
  const faqsShape = {
    type: "array" as const,
    items: {
      type: "object",
      properties: {
        question:   { type: "string" },
        answer:     { type: "string" },
        source_url: { type: "string" },
      },
      required: ["question", "answer"],
    },
  };

  // For "auto" the model picks any fields the page contains.
  const fields = category === "auto"
    ? { providers: providersShape, business_hours: hoursShape, procedures: proceduresShape, faqs: faqsShape, directions_parking_info: { type: "string" as const }, pricing_notes: { type: "string" as const } }
    : category === "providers" ? { providers: providersShape }
    : category === "hours"     ? { business_hours: hoursShape }
    : category === "procedures" ? { procedures: proceduresShape }
    : category === "faqs"      ? { faqs: faqsShape }
    : /* policies */             { directions_parking_info: { type: "string" as const }, pricing_notes: { type: "string" as const } };

  return {
    name: "submit_extraction",
    description: `Extract structured ${category === "auto" ? "data" : category} from the supplied page text. Omit any field you can't confidently extract — do not fabricate.`,
    input_schema: {
      type: "object",
      properties: fields,
      additionalProperties: false,
    } as Anthropic.Tool["input_schema"],
  };
}

// Merge extracted data into the prospect row additively — arrays append
// (deduped by a key), scalar fields fill only if currently empty.
async function mergeIntoProspect(
  prospect: Record<string, unknown>,
  extracted: Record<string, unknown>,
  sourceUrl: string
): Promise<{ updates: Record<string, unknown>; summary: string[] }> {
  const updates: Record<string, unknown> = {};
  const summary: string[] = [];

  // Arrays: dedupe by .name (providers/procedures) or .question (faqs).
  function mergeArray(field: string, keyFn: (x: Record<string, unknown>) => string) {
    const incoming = Array.isArray(extracted[field]) ? extracted[field] as Record<string, unknown>[] : null;
    if (!incoming || incoming.length === 0) return;
    const existing = Array.isArray(prospect[field]) ? prospect[field] as Record<string, unknown>[] : [];
    const have = new Set(existing.map(keyFn).map((s) => s.toLowerCase()));
    const newOnes = incoming
      .map((item) => ({ ...item, source_url: item.source_url || sourceUrl }))
      .filter((item) => {
        const k = keyFn(item);
        if (!k || have.has(k.toLowerCase())) return false;
        have.add(k.toLowerCase());
        return true;
      });
    if (newOnes.length === 0) return;
    updates[field] = [...existing, ...newOnes];
    summary.push(`+${newOnes.length} ${field}`);
  }

  mergeArray("providers",  (x) => String(x.name ?? ""));
  mergeArray("procedures", (x) => String(x.name ?? ""));
  mergeArray("faqs",       (x) => String(x.question ?? ""));

  // Hours: merge per day — incoming day overrides only if the existing one
  // is missing or not a {open, close} pair.
  if (extracted.business_hours && typeof extracted.business_hours === "object") {
    const incoming = extracted.business_hours as Record<string, unknown>;
    const existing = (prospect.business_hours as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...existing };
    let added = 0;
    for (const [day, val] of Object.entries(incoming)) {
      const cur = existing[day];
      const curIsValid = cur && typeof cur === "object" &&
        typeof (cur as Record<string, unknown>).open === "string" &&
        typeof (cur as Record<string, unknown>).close === "string";
      if (!curIsValid) {
        merged[day] = val;
        if (val !== undefined) added += 1;
      }
    }
    if (added > 0) {
      updates.business_hours = merged;
      summary.push(`+${added} hours days`);
    }
  }

  // Scalar text fields: fill only if currently empty.
  for (const key of ["directions_parking_info", "pricing_notes"] as const) {
    const incoming = typeof extracted[key] === "string" ? (extracted[key] as string).trim() : "";
    const existingStr = typeof prospect[key] === "string" ? (prospect[key] as string).trim() : "";
    if (incoming && !existingStr) {
      updates[key] = incoming;
      summary.push(`set ${key}`);
    }
  }

  // Append source row so the imported URL shows up in the research sources list.
  const sources = Array.isArray(prospect.sources) ? prospect.sources as Record<string, unknown>[] : [];
  const importedFields = Object.keys(updates).filter((k) => k !== "sources");
  if (importedFields.length > 0) {
    updates.sources = [
      ...sources,
      { url: sourceUrl, fields_extracted: importedFields, imported_manually: true, imported_at: new Date().toISOString() },
    ];
  }

  return { updates, summary };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  const url = body.url?.trim();
  const category = (body.category ?? "auto") as Category;

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Valid URL required (must start with http:// or https://)" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  // Load prospect — we need both the table name (crm_prospects vs outreach_prospects)
  // and the existing fields for the additive merge.
  let table: "crm_prospects" | "outreach_prospects" = "crm_prospects";
  let { data: prospect } = await supabaseAdmin.from(table).select("*").eq("id", id).maybeSingle();
  if (!prospect) {
    table = "outreach_prospects";
    const r = await supabaseAdmin.from(table).select("*").eq("id", id).maybeSingle();
    prospect = r.data;
  }
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Fetch the URL — 10s timeout, browser-ish UA so most sites cooperate.
  let pageText = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VauxVoice-Importer/1.0; +https://vauxvoice.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json({ error: `Page returned ${res.status} ${res.statusText}` }, { status: 502 });
    }
    const raw = await res.text();
    pageText = htmlToText(raw);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch URL: ${(err as Error).message}` }, { status: 502 });
  }

  if (pageText.length < 50) {
    return NextResponse.json({ error: "Page content too short — likely a redirect or empty page" }, { status: 400 });
  }
  // Cap to keep input tokens bounded. 60k chars is roughly 15k tokens — plenty
  // for one page and well under context window.
  const trimmed = pageText.slice(0, 60_000);

  // Ask Claude to extract — single shot, no loop. The tool schema constrains
  // the output to our canonical shape so no post-processing is needed.
  const tool = buildExtractTool(category);
  let extracted: Record<string, unknown> = {};
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `You are extracting structured data from a med spa's website page. The user provided this URL because previous research missed information. Extract ONLY what's clearly stated on the page — do not infer or fabricate.\n\nCategory requested: ${category}\n\nPage URL: ${url}\n\nPage content:\n${trimmed}`,
        },
      ],
    });
    const toolUse = response.content.find((c) => c.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
    if (toolUse) extracted = toolUse.input as Record<string, unknown>;
  } catch (err) {
    return NextResponse.json({ error: `Extraction failed: ${(err as Error).message}` }, { status: 500 });
  }

  const { updates, summary } = await mergeIntoProspect(
    prospect as Record<string, unknown>,
    extracted,
    url
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      ok: true,
      imported: false,
      message: "Nothing new found on that page",
      extracted,
    });
  }

  const { error: updateErr } = await supabaseAdmin
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 });
  }

  await logProspectEvent({
    prospect_id: id,
    event_type: "url_imported",
    summary: `Imported from ${url}: ${summary.join(", ")}`,
    payload: { url, category, fields: Object.keys(updates).filter((k) => k !== "sources") },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    imported: true,
    summary: summary.join(", "),
    fields: Object.keys(updates).filter((k) => k !== "sources"),
  });
}
