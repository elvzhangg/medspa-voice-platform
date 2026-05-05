import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { computeConfidence } from "@/lib/prospect-confidence";

// Mirrors /api/admin/agent/research but writes to crm_prospects and skips the
// outreach-only steps (campaigns, email drafting, demo auto-provision). The
// CRM agent's sole job: find verified med-spa leads and drop them in
// top-of-funnel for human vetting.

function normalizeWebsite(website: string): string {
  return website
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export const runtime = "nodejs";
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: "log_step",
    description:
      "Record a reasoning step. Use to document what you're doing, found, decided, and why.",
    input_schema: {
      type: "object" as const,
      properties: {
        step_type: {
          type: "string",
          enum: ["thinking", "searching", "found", "decision", "summary"],
        },
        message: { type: "string" },
      },
      required: ["step_type", "message"],
    },
  },
  {
    name: "save_prospect",
    description:
      "Save a discovered med spa prospect to the CRM top-of-funnel. Only save real, verified businesses. Only include fields you have actually verified from the spa's own website or other authoritative sources. Leave a field out if you're guessing.",
    input_schema: {
      type: "object" as const,
      properties: {
        business_name: { type: "string" },
        website: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        city: { type: "string" },
        state: { type: "string", description: "Two-letter abbrev (CA, NY, ...)" },
        address: { type: "string" },
        booking_platform: {
          type: "string",
          enum: ["Acuity", "Boulevard", "Mindbody", "Other", "Unknown"],
        },
        owner_name: { type: "string" },
        owner_title: { type: "string" },
        owner_email: { type: "string" },
        locations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              address: { type: "string" },
              phone: { type: "string" },
              hours: { type: "string" },
            },
          },
        },
        procedures: {
          type: "array",
          description:
            "Procedures offered. Each MUST include source_url for the page where the price/details were verified. Drop the field entirely if you can't cite a URL.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              duration_min: { type: "number" },
              price: { type: "string" },
              notes: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["name"],
          },
        },
        providers: {
          type: "array",
          description: "Staff members. Each MUST include source_url to the team/about page.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              specialties: { type: "array", items: { type: "string" } },
              bio: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["name"],
          },
        },
        business_hours: {
          type: "object",
          description: "Operating hours keyed by day name (monday..sunday).",
          additionalProperties: true,
        },
        faqs: {
          type: "array",
          description: "FAQ entries lifted from their FAQ/policies page. Each MUST cite source_url.",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["question", "answer"],
          },
        },
        research_sources: {
          type: "array",
          description: "Every URL you actually fetched, with which fields came from each.",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              fields_extracted: { type: "array", items: { type: "string" } },
            },
            required: ["url"],
          },
        },
        verification_notes: {
          type: "object",
          properties: {
            google_business_profile_url: { type: "string" },
            yelp_url: { type: "string" },
            address_confirmed_by: { type: "array", items: { type: "string" } },
            phone_confirmed_by: { type: "array", items: { type: "string" } },
            still_operating: { type: "boolean" },
            discrepancies: { type: "array", items: { type: "string" } },
          },
        },
        services_summary: { type: "string" },
        pricing_notes: { type: "string" },
        notes: { type: "string" },
      },
      required: ["business_name", "city", "state"],
    },
  },
];

const SERVER_TOOLS = [{ type: "web_search_20250305" as const, name: "web_search" }];

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const regions: string[] =
    Array.isArray(body.target_regions) && body.target_regions.length
      ? body.target_regions
      : ["California", "New York"];
  const platforms: string[] =
    Array.isArray(body.target_platforms) && body.target_platforms.length
      ? body.target_platforms
      : ["Acuity", "Boulevard", "Mindbody"];

  // Pull the most-recently-added CRM rows so the agent doesn't rediscover
  // them. Scope across all stages — no point re-finding rejected leads either.
  const { data: knownRows } = await supabaseAdmin
    .from("crm_prospects")
    .select("business_name, website_normalized, city, state")
    .order("created_at", { ascending: false })
    .limit(200);

  const knownList = (knownRows ?? [])
    .map((p) => {
      const where = [p.city, p.state].filter(Boolean).join(", ");
      const site = p.website_normalized ?? "(no website)";
      return `- ${p.business_name}${where ? ` (${where})` : ""} — ${site}`;
    })
    .join("\n");

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encode(obj));

      try {
        send({
          type: "step",
          step_type: "thinking",
          message: `Starting CRM research — targeting ${regions.join(", ")} med spas using ${platforms.join(", ")}`,
        });

        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: `You are a B2B sales research agent for VauxVoice — an AI voice receptionist platform for med spas.

Your mission: Find real med spa prospects in ${regions.join(" and ")} that use ${platforms.join(", ")} booking software. These are ideal customers because they already have online booking infrastructure that VauxVoice can plug into.

For each prospect:
1. Use log_step frequently to document what you're doing and why
2. Use web_search to find real businesses
3. VISIT THE SPA'S OWN WEBSITE to extract structured details (services, pricing, providers, contact, about)
4. Call save_prospect with as much structured detail as you can verify

Saved prospects land in the CRM **top-of-funnel** sheet for a human to vet. Do NOT draft emails or provision demos — those happen after a human promotes the lead into the CRM.

## Source-citation rules (HARD)
Every fact saved MUST be traceable to a real URL you fetched. The schema requires source_url on each procedure, provider, and FAQ. **If you can't cite a source URL for a field, omit that field. Do not guess.**
- A procedure with a price MUST have a source_url showing that price.
- A provider MUST have a source_url to their team/about page entry.
- An FAQ entry MUST have a source_url.
- research_sources[] is your audit trail — every URL you fetched, with which fields came from each.

## Verification pass (REQUIRED before save_prospect)
After collecting data from the spa's own site, do 2–3 cross-source web_searches:
1. "[business_name] [city] google business" — Google Business Profile
2. "[business_name] [city] yelp" — Yelp listing
3. (Optional) "[business_name] [city] reviews 2026" — recent activity

Populate verification_notes:
- google_business_profile_url, yelp_url
- address_confirmed_by: which sources confirmed the address (e.g. ["website", "google", "yelp"])
- phone_confirmed_by: same for phone
- still_operating: true only if recent reviews/posts/activity (last ~6 months)
- discrepancies: contradictions between sources, or empty array

If still_operating is false OR address can't be confirmed by at least one external source, do NOT save_prospect — log a step explaining why you skipped.

## Hard rules
- 5–10 high-quality prospects, not a flood of low-confidence ones
- Empty field beats wrong field. Never fabricate.
- Booking platform must be verified (booking link on their site, footer logo, or a review mentioning the platform)

ALREADY-KNOWN PROSPECTS — do NOT rediscover or re-save these:
${knownList || "(none yet — this is the first run)"}

If your ideal candidates overlap with the known list, surface different neighborhoods or sub-segments. Three genuinely new prospects beat ten duplicates.

Start now.`,
          },
        ];

        let continueLoop = true;
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 8000,
            thinking: { type: "enabled", budget_tokens: 4000 },
            tools: [...SERVER_TOOLS, ...CUSTOM_TOOLS] as Anthropic.Tool[],
            messages,
          });

          const toolUses: Anthropic.ToolUseBlock[] = [];

          for (const block of response.content) {
            if (block.type === "thinking") {
              const t = (block as { type: "thinking"; thinking: string }).thinking;
              send({
                type: "step",
                step_type: "thinking",
                message: `[Reasoning] ${t.slice(0, 500)}${t.length > 500 ? "…" : ""}`,
              });
            } else if (block.type === "text" && block.text.trim()) {
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              toolUses.push(block);
            }
          }

          messages.push({
            role: "assistant",
            content: response.content as unknown as Anthropic.ContentBlockParam[],
          });

          if (response.stop_reason === "end_turn" || toolUses.length === 0) {
            continueLoop = false;
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUses) {
            if (toolUse.name === "log_step") {
              const input = toolUse.input as { step_type: string; message: string };
              send({ type: "step", step_type: input.step_type, message: input.message });
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "Logged.",
              });
              continue;
            }

            if (toolUse.name === "save_prospect") {
              const raw = toolUse.input as Record<string, unknown>;
              const businessName = String(raw.business_name ?? "");
              const city = String(raw.city ?? "");
              const state = String(raw.state ?? "");
              const websiteRaw = raw.website ? String(raw.website) : "";
              const normalizedWebsite = websiteRaw ? normalizeWebsite(websiteRaw) : null;

              send({
                type: "step",
                step_type: "found",
                message: `Saving prospect: ${businessName} (${city}, ${state})`,
              });

              // Dedup by normalized website. If we already have this lead in
              // any stage, skip the insert — but still emit a saved event so
              // the UI shows it was processed.
              let savedId: string | null = null;
              let wasDedup = false;
              if (normalizedWebsite) {
                const { data: existing } = await supabaseAdmin
                  .from("crm_prospects")
                  .select("id, business_name, crm_stage")
                  .eq("website_normalized", normalizedWebsite)
                  .maybeSingle();
                if (existing) {
                  savedId = existing.id;
                  wasDedup = true;
                  send({
                    type: "step",
                    step_type: "decision",
                    message: `Already in CRM as ${existing.business_name} (stage=${existing.crm_stage}) — skipping`,
                  });
                }
              }

              const confidence = computeConfidence({
                website: websiteRaw || null,
                phone: raw.phone as string | undefined,
                email: raw.email as string | undefined,
                owner_name: raw.owner_name as string | undefined,
                owner_email: raw.owner_email as string | undefined,
                address: raw.address as string | undefined,
                procedures: raw.procedures as Array<{ name?: string; price?: string | number }> | undefined,
                providers: raw.providers as Array<{ name?: string }> | undefined,
                business_hours: raw.business_hours as Record<string, unknown> | undefined,
                research_sources: raw.research_sources as Array<{ url?: string }> | undefined,
                faqs: raw.faqs as Array<{ question?: string; answer?: string }> | undefined,
              });

              if (!wasDedup) {
                const { data: inserted, error: insErr } = await supabaseAdmin
                  .from("crm_prospects")
                  .insert({
                    business_name: businessName,
                    website: websiteRaw || null,
                    email: (raw.email as string | undefined) ?? null,
                    phone: (raw.phone as string | undefined) ?? null,
                    city,
                    state,
                    address: (raw.address as string | undefined) ?? null,
                    booking_platform: (raw.booking_platform as string | undefined) ?? "Unknown",
                    owner_name: (raw.owner_name as string | undefined) ?? null,
                    owner_email: (raw.owner_email as string | undefined) ?? null,
                    owner_title: (raw.owner_title as string | undefined) ?? null,
                    locations: raw.locations ?? null,
                    procedures: raw.procedures ?? null,
                    providers: raw.providers ?? null,
                    business_hours: raw.business_hours ?? null,
                    faqs: raw.faqs ?? null,
                    research_sources: raw.research_sources ?? null,
                    verification_notes: raw.verification_notes ?? null,
                    research_confidence: confidence.score,
                    researched_at: new Date().toISOString(),
                    services_summary: (raw.services_summary as string | undefined) ?? null,
                    pricing_notes: (raw.pricing_notes as string | undefined) ?? null,
                    notes: (raw.notes as string | undefined) ?? null,
                    crm_stage: "top_of_funnel",
                  })
                  .select("id")
                  .single();

                if (insErr || !inserted) {
                  console.error(`[crm-research] Insert failed for ${businessName}:`, insErr?.message);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: `Error saving: ${insErr?.message ?? "unknown"}`,
                    is_error: true,
                  });
                  continue;
                }

                savedId = inserted.id;
                send({
                  type: "prospect_saved",
                  prospect_id: savedId,
                  business_name: businessName,
                  confidence: confidence.score,
                });
              }

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  prospect_id: savedId,
                  confidence: confidence.score,
                  deduped: wasDedup,
                }),
              });
            }
            // web_search results are returned by the API — no tool_result needed.
          }

          if (toolResults.length > 0) {
            messages.push({ role: "user", content: toolResults });
          }
        }

        send({ type: "done", message: "Research complete. Vet the new top-of-funnel rows." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
