import OpenAI from "openai";
import { supabaseAdmin } from "./supabase";

/**
 * Client brief generator — the "who's walking in and what should I remember?"
 * endpoint. Tier 1 of the staff chat feature: no chatbot, just an always-fresh
 * pre-appointment briefing on the client profile page.
 *
 * Pipeline:
 *   1. Pull profile, recent calls, upcoming/recent appointments
 *   2. If a fresh summary already exists on client_profiles, include it as context
 *   3. LLM call → ~150 words of prose, warm and colleague-voiced
 *   4. Return prose + source call IDs for the UI's "show your work" affordance
 *
 * Regeneration of the stored summary (client_profiles.summary) happens
 * OUT-OF-BAND via the Vapi end-of-call webhook — see api/vapi/webhook.
 * The brief endpoint never writes to client_profiles.summary; it only reads
 * and synthesizes the live brief on demand.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });

const MODEL = "gpt-4o";
const RECENT_CALLS_LIMIT = 5;
const UPCOMING_EVENTS_LIMIT = 2;

export interface ClientBrief {
  text: string;
  /** Call log IDs that informed the brief — surfaced in the UI for transparency */
  sourceCallIds: string[];
  /** True when the client has no call history yet — UI can show a soft state */
  coldStart: boolean;
  generatedAt: string;
}

interface ProfileRow {
  id: string;
  tenant_id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  total_calls: number;
  total_bookings: number;
  last_call_at: string | null;
  last_booking_at: string | null;
  last_service: string | null;
  last_provider: string | null;
  preferred_provider: string | null;
  preferred_time: string | null;
  referral_source: string | null;
  tags: string[] | null;
  staff_notes: string | null;
  summary: string | null;
  summary_updated_at: string | null;
}

interface CallLogRow {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  transcript: string | null;
  created_at: string;
}

interface CalendarEventRow {
  title: string;
  start_time: string;
  service_type: string | null;
  status: string;
}

function displayName(p: ProfileRow): string {
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return n || p.phone;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateClientBrief(
  tenantId: string,
  clientProfileId: string
): Promise<ClientBrief | null> {
  // Pull the profile first. Scoped by tenant_id so a bad client_profile_id
  // from another tenant can't leak through.
  const { data: profile } = await supabaseAdmin
    .from("client_profiles")
    .select(
      "id, tenant_id, phone, first_name, last_name, total_calls, total_bookings, last_call_at, last_booking_at, last_service, last_provider, preferred_provider, preferred_time, referral_source, tags, staff_notes, summary, summary_updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("id", clientProfileId)
    .maybeSingle();

  if (!profile) return null;
  const p = profile as ProfileRow;

  // Recent call history — per-call summaries feed the synthesis, full
  // transcripts are truncated to keep the prompt small.
  const { data: callLogs } = await supabaseAdmin
    .from("call_logs")
    .select("id, caller_number, duration_seconds, summary, transcript, created_at")
    .eq("tenant_id", tenantId)
    .eq("caller_number", p.phone)
    .order("created_at", { ascending: false })
    .limit(RECENT_CALLS_LIMIT);

  const calls = (callLogs ?? []) as CallLogRow[];

  // Upcoming appointments (and any still-in-progress today)
  const nowIso = new Date().toISOString();
  const { data: upcoming } = await supabaseAdmin
    .from("calendar_events")
    .select("title, start_time, service_type, status")
    .eq("tenant_id", tenantId)
    .eq("customer_phone", p.phone)
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(UPCOMING_EVENTS_LIMIT);

  const events = (upcoming ?? []) as CalendarEventRow[];

  const coldStart = p.total_calls === 0 && calls.length === 0;

  // Build the structured context block the LLM grounds on. We do NOT
  // inject tenant-level data here — everything is client-scoped.
  const contextLines: string[] = [];
  contextLines.push(`Client: ${displayName(p)} (${p.phone})`);
  contextLines.push(
    `Lifetime: ${p.total_calls} calls, ${p.total_bookings} bookings${
      p.last_call_at ? `, last call ${formatDate(p.last_call_at)}` : ""
    }`
  );
  if (p.last_service) contextLines.push(`Last service: ${p.last_service}`);
  if (p.last_provider) contextLines.push(`Last provider: ${p.last_provider}`);
  if (p.preferred_provider) contextLines.push(`Preferred provider: ${p.preferred_provider}`);
  if (p.preferred_time) contextLines.push(`Preferred time: ${p.preferred_time}`);
  if (p.referral_source) contextLines.push(`Referred by: ${p.referral_source}`);
  if (p.tags && p.tags.length) contextLines.push(`Tags: ${p.tags.join(", ")}`);
  if (p.staff_notes?.trim()) contextLines.push(`Staff notes: ${p.staff_notes.trim()}`);
  if (p.summary?.trim()) contextLines.push(`Existing summary: ${p.summary.trim()}`);

  if (events.length) {
    contextLines.push("");
    contextLines.push("Upcoming:");
    for (const e of events) {
      contextLines.push(
        `- ${formatDate(e.start_time)} — ${e.service_type || e.title}${
          e.status !== "confirmed" ? ` (${e.status})` : ""
        }`
      );
    }
  }

  if (calls.length) {
    contextLines.push("");
    contextLines.push("Recent calls (most recent first):");
    for (const c of calls) {
      const snippet = c.summary?.trim() || (c.transcript ? c.transcript.slice(0, 400) : "");
      contextLines.push(`- ${formatDate(c.created_at)}: ${snippet || "(no summary)"}`);
    }
  }

  const context = contextLines.join("\n");

  const systemPrompt = `You help med spa staff remember context about their clients. Produce a short pre-appointment briefing — about 150 words, warm and colleague-to-colleague, prose not bullets.

Lead with what matters most for the next interaction: the upcoming appointment (if any), then preferences or open threads, then anything rapport-worthy (wedding coming up, anxious about needles, referred by X). Skip anything that isn't in the provided material — do NOT invent facts. If you don't have enough to say something, say "no notes on file yet" instead of padding.

Cite casually ("from her last call" / "per her profile"), don't say "based on the data" or reference sources formally. Never make medical recommendations.`;

  let text: string;
  if (coldStart) {
    // Deterministic cold-start message; don't waste an LLM call on a
    // client we know nothing about.
    text = `No notes on file yet for ${displayName(p)}. They haven't called your AI Clientele Specialist before${
      events.length > 0 ? `, but they're booked for ${formatDate(events[0].start_time)}.` : "."
    } Once they've interacted, this brief will fill in.`;
  } else {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 260, // ~150-180 words
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context },
        ],
      });
      text = completion.choices[0]?.message?.content?.trim() ||
        `No notes on file yet for ${displayName(p)}.`;
    } catch (err) {
      console.error("CLIENT_BRIEF_LLM_ERR:", err);
      // Fall back to a structured summary so staff sees *something* useful
      // even when the LLM is unreachable. Better than a blank card.
      text = buildFallbackBrief(p, calls, events);
    }
  }

  return {
    text,
    sourceCallIds: calls.map((c) => c.id),
    coldStart,
    generatedAt: new Date().toISOString(),
  };
}

function buildFallbackBrief(
  p: ProfileRow,
  calls: CallLogRow[],
  events: CalendarEventRow[]
): string {
  const parts: string[] = [];
  parts.push(`${displayName(p)} — ${p.total_calls} calls, ${p.total_bookings} bookings.`);
  if (events.length) {
    parts.push(`Next up: ${events[0].service_type || events[0].title} on ${formatDate(events[0].start_time)}.`);
  }
  if (p.last_service && p.last_provider) {
    parts.push(`Last visit: ${p.last_service} with ${p.last_provider}.`);
  }
  if (p.preferred_provider) parts.push(`Prefers ${p.preferred_provider}.`);
  if (p.staff_notes?.trim()) parts.push(`Note: ${p.staff_notes.trim()}`);
  if (calls[0]?.summary) parts.push(`Most recent call: ${calls[0].summary}`);
  return parts.join(" ");
}

/**
 * Called from the Vapi end-of-call webhook. Synthesizes a rolling summary
 * from the client's full recent history and writes it back to
 * client_profiles.summary so the voice AI can read it on the next call
 * without an on-the-fly LLM hop.
 *
 * Fire-and-forget from the caller's perspective; errors are logged but
 * never bubble.
 */
export async function regenerateClientSummary(
  tenantId: string,
  clientProfileId: string
): Promise<void> {
  try {
    const brief = await generateClientBrief(tenantId, clientProfileId);
    if (!brief) return;

    // Embed the summary for pgvector cross-client search in the chat layer.
    // If embedding fails, we still save the summary — search falls back to
    // ILIKE in that path.
    let embedding: number[] | null = null;
    try {
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: brief.text,
      });
      embedding = embRes.data[0]?.embedding ?? null;
    } catch (err) {
      console.error("CLIENT_SUMMARY_EMBED_ERR:", clientProfileId, err);
    }

    const update: Record<string, unknown> = {
      summary: brief.text,
      summary_updated_at: brief.generatedAt,
      summary_source_call_ids: brief.sourceCallIds,
    };
    if (embedding) update.summary_embedding = embedding;

    await supabaseAdmin
      .from("client_profiles")
      .update(update)
      .eq("id", clientProfileId)
      .eq("tenant_id", tenantId);
  } catch (err) {
    console.error("REGENERATE_CLIENT_SUMMARY_ERR:", tenantId, clientProfileId, err);
  }
}
