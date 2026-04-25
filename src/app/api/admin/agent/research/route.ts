import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";
import { computeConfidence, AUTO_RUN_CONFIDENCE_THRESHOLD } from "@/lib/prospect-confidence";
import { provisionDemoForProspect } from "@/lib/demo-provisioner";
import { draftEmailForProspect } from "@/lib/email-drafter";

function normalizeWebsite(website: string): string {
  return website
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

/**
 * Inserts a prospect with all requested fields. If Postgres rejects the insert
 * because a column doesn't exist (pending migration), strips that column and
 * retries. Returns the saved id + which columns got dropped, or null on fatal error.
 *
 * Without this, a single missing migration column destroys the whole research run —
 * no rows save, so the global dedup has no memory on retry, forcing the agent to
 * redo every web search.
 */
async function safeInsertProspect(
  row: Record<string, unknown>
): Promise<{ id: string | null; droppedColumns: string[]; error?: string }> {
  let toInsert = { ...row };
  const dropped: string[] = [];
  for (let attempt = 0; attempt < 15; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("outreach_prospects")
      .insert(toInsert)
      .select("id")
      .single();
    if (!error && data) return { id: data.id, droppedColumns: dropped };

    if (!error) return { id: null, droppedColumns: dropped, error: "Unknown insert error" };

    const missingColMatch = error.message.match(/column "?([a-z_][a-z0-9_]*)"?\s+of relation/i);
    if (missingColMatch && toInsert[missingColMatch[1]] !== undefined) {
      const col = missingColMatch[1];
      dropped.push(col);
      delete toInsert[col];
      continue;
    }

    return { id: null, droppedColumns: dropped, error: error.message };
  }
  return { id: null, droppedColumns: dropped, error: "Too many missing columns — giving up" };
}

export const runtime = "nodejs";
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Custom tool definitions (handled client-side in our loop)
const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: "log_step",
    description:
      "Record a reasoning step or observation during research. Use this to document your thinking, what you found, decisions made, and why.",
    input_schema: {
      type: "object" as const,
      properties: {
        step_type: {
          type: "string",
          enum: ["thinking", "searching", "found", "decision", "summary"],
          description: "Category of this step",
        },
        message: {
          type: "string",
          description: "The step description or observation",
        },
      },
      required: ["step_type", "message"],
    },
  },
  {
    name: "save_prospect",
    description:
      "Save a discovered med spa prospect to the database with as much structured detail as you can verify. Only save businesses that are real, have a working website, and are genuinely likely to benefit from an AI voice receptionist. Only include fields you've actually verified from the spa's own website or other authoritative sources. Leave a field out if you're guessing.",
    input_schema: {
      type: "object" as const,
      properties: {
        business_name: { type: "string", description: "Name of the med spa" },
        website: { type: "string", description: "Website URL" },
        email: { type: "string", description: "General contact email if found" },
        phone: { type: "string", description: "Main phone number if found" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State (e.g. CA, NY)" },
        address: { type: "string", description: "Full street address for main location" },
        booking_platform: {
          type: "string",
          enum: ["Acuity", "Boulevard", "Mindbody", "Other", "Unknown"],
        },
        owner_name: { type: "string", description: "Name of the owner or manager if found on About page / LinkedIn" },
        owner_title: { type: "string", description: "Their role (Owner, Medical Director, Manager, etc.)" },
        owner_email: { type: "string", description: "Direct email to the owner/manager if distinct from general email" },
        locations: {
          type: "array",
          description: "All physical locations. Each entry: { label, address, phone, hours }",
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
          description: "Individual procedures/services with details. Each MUST include a source_url — the page you actually fetched the price/details from. Drop the field entirely if you can't cite a URL.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              duration_min: { type: "number" },
              price: { type: "string", description: "e.g. '$300' or 'from $12/unit'" },
              notes: { type: "string" },
              source_url: { type: "string", description: "URL where this procedure's name + (especially) price was verified. REQUIRED if price is set." },
            },
            required: ["name"],
          },
        },
        providers: {
          type: "array",
          description: "Medical/aesthetic providers on staff. Each MUST include a source_url pointing to the team/about page where you found them.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              specialties: { type: "array", items: { type: "string" } },
              bio: { type: "string" },
              source_url: { type: "string", description: "URL where this provider's name and title was found (typically the spa's team/about page)." },
            },
            required: ["name"],
          },
        },
        business_hours: {
          type: "object",
          description: "Operating hours keyed by day name (monday, tuesday, ...). Values can be { open, close } or a display string like '9am–6pm' or 'Closed'.",
          additionalProperties: true,
        },
        directions_parking_info: {
          type: "string",
          description: "Parking instructions, building entrance notes, validation — whatever a first-time visitor would ask. Leave empty if not stated on the website.",
        },
        booking_config: {
          type: "object",
          description:
            "Spa policies + payment info. Shape: { cancellation_policy: string, deposit_policy: string, deposit_amount_display: string, late_policy: string, payment_methods: string[], financing_options: string[], membership_program: string }. Populate only fields you can verify from their site (policies page, FAQ, new-patient page).",
          properties: {
            cancellation_policy: { type: "string", description: "e.g. '24 hours notice required; otherwise full charge'" },
            deposit_policy: { type: "string", description: "e.g. 'Non-refundable deposit required to book'" },
            deposit_amount_display: { type: "string", description: "e.g. '$100' or '25% of service'" },
            late_policy: { type: "string", description: "e.g. 'Grace period of 10 minutes'" },
            payment_methods: { type: "array", items: { type: "string" }, description: "e.g. ['Visa', 'Mastercard', 'Amex', 'Cash', 'HSA/FSA']" },
            financing_options: { type: "array", items: { type: "string" }, description: "e.g. ['CareCredit', 'Cherry', 'Afterpay']" },
            membership_program: { type: "string", description: "Description of any membership/VIP/loyalty program" },
          },
        },
        faqs: {
          type: "array",
          description:
            "FAQ entries lifted directly from their FAQ or policies page. Each MUST cite a source_url. Prioritize questions a first-time caller might ask (consultation cost, downtime for popular procedures, age restrictions, numbing options, etc.). Up to 10 entries.",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              source_url: { type: "string", description: "URL where this Q/A was found." },
            },
            required: ["question", "answer"],
          },
        },
        system_prompt_override: {
          type: "string",
          description:
            "Free-text notes that describe the spa's vibe, selling points, and voice tone. Examples: 'Luxury brand targeting 35-55 professional women; warm, discreet tone. Known for natural-looking injectables and the latest in regenerative aesthetics (PRP, exosomes). Emphasize consultation-first approach.' Keep under 300 words. This shapes how the AI Clientele Specialist sounds.",
        },
        social_links: {
          type: "object",
          description: "Social profile URLs",
          properties: {
            instagram: { type: "string" },
            facebook: { type: "string" },
            tiktok: { type: "string" },
            yelp: { type: "string" },
            google: { type: "string" },
          },
        },
        research_sources: {
          type: "array",
          description: "URLs you actually fetched or referenced for this prospect",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              fields_extracted: {
                type: "array",
                items: { type: "string" },
                description: "Which fields came from this source",
              },
            },
            required: ["url"],
          },
        },
        research_confidence: {
          type: "number",
          description: "Your overall confidence in the accuracy of this prospect's data, 0.0 to 1.0. Be honest — if you had to guess pricing, lower this.",
        },
        verification_notes: {
          type: "object",
          description:
            "After gathering data from the spa's own website, run cross-check searches: Google Business Profile, Yelp, the spa's actual phone number — confirm address, phone, and that the business is currently operating. Record what matched and what didn't.",
          properties: {
            google_business_profile_url: { type: "string" },
            yelp_url: { type: "string" },
            address_confirmed_by: {
              type: "array",
              items: { type: "string" },
              description: "List of sources that confirmed the address (e.g. ['google', 'yelp', 'website']). Empty if no cross-source verification was possible.",
            },
            phone_confirmed_by: {
              type: "array",
              items: { type: "string" },
              description: "Sources that confirmed the phone number.",
            },
            still_operating: {
              type: "boolean",
              description: "Did you find evidence the business is currently operating (recent reviews, recent posts, active website)?",
            },
            discrepancies: {
              type: "array",
              items: { type: "string" },
              description: "Any contradictions found between sources (e.g. 'website lists 1234 Main St but Google says 1240 Main St').",
            },
          },
        },
        services_summary: { type: "string", description: "Short free-text summary for scanning" },
        pricing_notes: { type: "string", description: "Free-text pricing summary if structured pricing wasn't available" },
        notes: { type: "string", description: "Anything else useful for sales context" },
      },
      required: ["business_name", "city", "state"],
    },
  },
  {
    name: "draft_email",
    description:
      "Write a personalized outreach email draft for a prospect. The email will NOT be sent — it will be saved for admin review and approval.",
    input_schema: {
      type: "object" as const,
      properties: {
        prospect_id: {
          type: "string",
          description: "The ID of the saved prospect (from save_prospect)",
        },
        subject: { type: "string", description: "Email subject line" },
        body: {
          type: "string",
          description:
            "Email body in plain text. Be warm, specific, and concise (under 200 words). Reference the specific business, their booking platform, and how VauxVoice helps med spas like theirs.",
        },
      },
      required: ["prospect_id", "subject", "body"],
    },
  },
];

// Server-side tool (web_search) - handled automatically by Claude (now GA, no beta header needed)
const SERVER_TOOLS = [
  {
    type: "web_search_20250305" as const,
    name: "web_search",
  },
];

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json();

  if (!campaign_id) {
    return new Response("campaign_id required", { status: 400 });
  }

  // Fetch campaign details
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from("outreach_campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single();

  if (campErr || !campaign) {
    return new Response("Campaign not found", { status: 404 });
  }

  const regions: string[] = campaign.target_regions ?? ["CA", "NY"];
  const platforms: string[] = campaign.target_platforms ?? [
    "Acuity",
    "Boulevard",
    "Mindbody",
  ];

  // Pull already-known prospects globally so the agent doesn't rediscover them.
  // We pass the 200 most-recently-researched — enough context without blowing the prompt.
  const { data: knownProspects } = await supabaseAdmin
    .from("outreach_prospects")
    .select("business_name, website_normalized, city, state")
    .order("created_at", { ascending: false })
    .limit(200);

  const knownList = (knownProspects ?? [])
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
          message: `Starting research for campaign: "${campaign.name}" — targeting ${regions.join(", ")} med spas using ${platforms.join(", ")}`,
        });

        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: `You are a B2B sales research agent for VauxVoice — an AI voice receptionist platform for med spas.

Your mission: Find real med spa prospects in ${regions.join(" and ")} that use ${platforms.join(", ")} booking software. These are ideal customers for VauxVoice because they already have online booking infrastructure.

For each prospect:
1. Use log_step frequently to document what you're doing and why
2. Use web_search to find real businesses
3. VISIT THE SPA'S OWN WEBSITE to extract structured details — this is where the good data lives (services page, pricing page, providers/team page, contact page, about page)
4. Call save_prospect with as much structured detail as you can verify. Populate procedures[], providers[], hours, owner_name/owner_email when you can find them.

You do NOT need to call draft_email. The system automatically drafts personalized outreach emails for every prospect whose data is complete enough (data completeness ≥ 70% — driven by procedures with prices, owner email, hours, and provider list). Focus your effort on extraction quality — completeness directly determines whether a demo number gets provisioned and an email gets drafted for that prospect.

## Source-citation requirements (HARD RULES)

Every fact you save MUST be traceable to a real URL you actually fetched. The schema requires a source_url on each procedure, provider, and FAQ. **If you can't cite a source URL for a field, omit that field entirely. Do not guess.**

Rules of thumb:
- A procedure with a price MUST have a source_url showing that price. No source = drop the price (you can still keep the procedure name if found elsewhere).
- A provider MUST have a source_url showing their name + title (typically the Team/About page).
- An FAQ entry MUST have a source_url. If you can't find a real FAQ on their site, return an empty faqs array.
- research_sources[] is your global audit trail — every URL you fetched, with the fields you got from each.

## Verification pass (REQUIRED before save_prospect)

After collecting data from the spa's own website, do 2–3 cross-source web_searches to confirm the business is real and currently operating:
1. Search "[business_name] [city] google business" — find their Google Business Profile listing
2. Search "[business_name] [city] yelp" — find their Yelp listing
3. (Optional) Search "[business_name] [city] reviews 2026" — recent activity

Then populate verification_notes:
- google_business_profile_url and yelp_url if found
- address_confirmed_by: list which sources confirmed the address — e.g. ["website", "google", "yelp"]
- phone_confirmed_by: same for phone
- still_operating: true only if you saw recent reviews/posts/activity (within ~6 months)
- discrepancies: any contradictions ("website says 1234 Main St; Google says 1240 Main St"). Empty array if none.

If still_operating is false OR address can't be confirmed by at least one external source, do NOT save_prospect — the lead is too risky for outreach. Log a step explaining why you skipped it.

## Field-by-field guidance

- procedures[]: list each distinct service as its own entry with source_url. Botox, fillers, laser hair removal, IPL, microneedling, hydrafacials, body contouring, etc. each get their own row.
- providers[]: each staff member on the Team page, with source_url to that page.
- business_hours: keyed by day (monday..sunday). Use display strings like "9am–6pm" or "Closed" — don't invent values.
- owner_name / owner_email: look for "Medical Director", "Founder", "Owner" on About pages. Distinguish from generic info@ emails — the direct owner email, if stated, is far more valuable for outreach.
- directions_parking_info: lifted from Contact / Location / Visit pages.
- booking_config: cancellation, deposit, late-arrival, payment methods, financing — usually on a dedicated Policies or FAQ page.
- faqs[]: the spa's actual FAQ page, with source_urls.
- system_prompt_override: a short paragraph describing who they serve, brand vibe, standout procedures. Your interpretation of what you read, not a direct quote. No source_url required (it's interpretive).

Completeness > fabrication. An empty field beats a wrong field. Confidence scores deterministically from real fields filled — leaving a field blank just lowers the score; lying about it can ruin a real customer relationship.

Hard rules:
- Only save real, verifiable businesses
- 5–10 high-quality prospects, not a flood of low-confidence ones
- NEVER fabricate. Missing field > made-up field.
- Personalize each email — reference specific procedures, the city, their booking platform, how VauxVoice books directly into Acuity/Boulevard/Mindbody
- Emails warm, professional, under 200 words

VauxVoice value prop: AI handles incoming calls 24/7, books appointments directly into their existing system, dramatically reduces missed calls and front-desk overhead.

ALREADY-KNOWN PROSPECTS — DO NOT rediscover or re-save these. Pick different businesses:
${knownList || "(none yet)"}

If the ideal set of businesses you'd otherwise pick heavily overlaps with the known list, surface different neighborhoods or slightly different segments within the region. It's better to return 3 genuinely new prospects than 10 duplicates.

Start now.`,
          },
        ];

        // Maps save_prospect tool_use_id → saved prospect DB id (for draft_email references)
        const _prospectIds: Record<string, string> = {};

        let continueLoop = true;
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 8000,
            thinking: { type: "enabled", budget_tokens: 4000 },
            tools: [...SERVER_TOOLS, ...CUSTOM_TOOLS] as Anthropic.Tool[],
            messages,
          });

          // Process content blocks
          const toolUses: Anthropic.ToolUseBlock[] = [];

          for (const block of response.content) {
            if (block.type === "thinking") {
              send({
                type: "step",
                step_type: "thinking",
                message: `[Reasoning] ${(block as { type: "thinking"; thinking: string }).thinking.slice(0, 500)}${(block as { type: "thinking"; thinking: string }).thinking.length > 500 ? "…" : ""}`,
              });
            } else if (block.type === "text" && block.text.trim()) {
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              toolUses.push(block);
            }
          }

          // Add assistant message to history (beta blocks include server tool uses — cast through any)
          messages.push({ role: "assistant", content: response.content as unknown as Anthropic.ContentBlockParam[] });

          if (response.stop_reason === "end_turn" || toolUses.length === 0) {
            continueLoop = false;
            break;
          }

          // Process tool calls
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUses) {
            const input = toolUse.input as Record<string, string>;

            if (toolUse.name === "log_step") {
              send({
                type: "step",
                step_type: input.step_type,
                message: input.message,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "Logged.",
              });
            } else if (toolUse.name === "save_prospect") {
              const rawInput = toolUse.input as Record<string, unknown>;
              const businessName = String(rawInput.business_name ?? "");
              const city = String(rawInput.city ?? "");
              const state = String(rawInput.state ?? "");
              const websiteRaw = rawInput.website ? String(rawInput.website) : "";
              const normalizedWebsite = websiteRaw ? normalizeWebsite(websiteRaw) : null;

              send({
                type: "step",
                step_type: "found",
                message: `Saving prospect: ${businessName} (${city}, ${state})`,
              });

              // Global dedup by normalized website — if already known, just add to campaign.
              let savedId: string | null = null;
              let wasDedup = false;
              if (normalizedWebsite) {
                const { data: existing } = await supabaseAdmin
                  .from("outreach_prospects")
                  .select("id, business_name")
                  .eq("website_normalized", normalizedWebsite)
                  .maybeSingle();
                if (existing) {
                  savedId = existing.id;
                  wasDedup = true;
                  await supabaseAdmin
                    .from("prospect_campaign_memberships")
                    .upsert({ prospect_id: existing.id, campaign_id });
                  send({
                    type: "step",
                    step_type: "decision",
                    message: `Already in DB as ${existing.business_name} — added to this campaign, skipping re-research`,
                  });
                }
              }

              // Compute deterministic confidence from the incoming structured fields
              const confidenceBreakdown = computeConfidence({
                website: websiteRaw || null,
                phone: rawInput.phone as string | undefined,
                email: rawInput.email as string | undefined,
                owner_name: rawInput.owner_name as string | undefined,
                owner_email: rawInput.owner_email as string | undefined,
                address: rawInput.address as string | undefined,
                procedures: rawInput.procedures as Array<{ name?: string; price?: string | number }> | undefined,
                providers: rawInput.providers as Array<{ name?: string }> | undefined,
                business_hours: rawInput.business_hours as Record<string, unknown> | undefined,
                research_sources: rawInput.research_sources as Array<{ url?: string }> | undefined,
                directions_parking_info: rawInput.directions_parking_info as string | undefined,
                booking_config: rawInput.booking_config as Record<string, unknown> | undefined,
                faqs: rawInput.faqs as Array<{ question?: string; answer?: string }> | undefined,
              });

              if (!wasDedup) {
                const insertResult = await safeInsertProspect({
                  campaign_id,
                  business_name: businessName,
                  website: websiteRaw || null,
                  email: rawInput.email ?? null,
                  phone: rawInput.phone ?? null,
                  city,
                  state,
                  address: rawInput.address ?? null,
                  booking_platform: rawInput.booking_platform ?? "Unknown",
                  owner_name: rawInput.owner_name ?? null,
                  owner_email: rawInput.owner_email ?? null,
                  owner_title: rawInput.owner_title ?? null,
                  locations: rawInput.locations ?? null,
                  procedures: rawInput.procedures ?? null,
                  providers: rawInput.providers ?? null,
                  business_hours: rawInput.business_hours ?? null,
                  directions_parking_info: rawInput.directions_parking_info ?? null,
                  booking_config: rawInput.booking_config ?? null,
                  faqs: rawInput.faqs ?? null,
                  system_prompt_override: rawInput.system_prompt_override ?? null,
                  social_links: rawInput.social_links ?? null,
                  research_sources: rawInput.research_sources ?? null,
                  verification_notes: rawInput.verification_notes ?? null,
                  research_confidence: confidenceBreakdown.score,
                  researched_at: new Date().toISOString(),
                  services_summary: rawInput.services_summary ?? null,
                  pricing_notes: rawInput.pricing_notes ?? null,
                  notes: rawInput.notes ?? null,
                  status: "researched",
                });

                if (!insertResult.id) {
                  console.error(
                    `[research-agent] Insert failed for ${businessName}: ${insertResult.error}`,
                    insertResult.droppedColumns.length
                      ? `(dropped columns tried: ${insertResult.droppedColumns.join(", ")})`
                      : ""
                  );
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: `Error saving: ${insertResult.error ?? "unknown error"}`,
                    is_error: true,
                  });
                  continue;
                }

                savedId = insertResult.id;
                await supabaseAdmin
                  .from("prospect_campaign_memberships")
                  .upsert({ prospect_id: savedId, campaign_id });

                if (insertResult.droppedColumns.length) {
                  // Tell the admin via a timeline event so they know to re-run migrations.
                  await logProspectEvent({
                    prospect_id: savedId,
                    event_type: "note_added",
                    summary: `Research saved core fields; skipped ${insertResult.droppedColumns.length} missing column(s) — run pending migration to capture: ${insertResult.droppedColumns.join(", ")}`,
                    payload: { dropped_columns: insertResult.droppedColumns },
                    actor: "agent:research",
                  });
                  send({
                    type: "step",
                    step_type: "decision",
                    message: `⚠ Saved core fields only — ${insertResult.droppedColumns.length} column(s) missing in DB: ${insertResult.droppedColumns.join(", ")} — run the latest migration`,
                  });
                }

                const proceduresLen = Array.isArray(rawInput.procedures) ? rawInput.procedures.length : 0;
                const providersLen = Array.isArray(rawInput.providers) ? rawInput.providers.length : 0;
                await logProspectEvent({
                  prospect_id: savedId,
                  event_type: "researched",
                  summary: `Research agent saved ${businessName} — ${proceduresLen} procedures, ${providersLen} providers, confidence ${Math.round(confidenceBreakdown.score * 100)}%`,
                  actor: "agent:research",
                });
                send({
                  type: "prospect_saved",
                  prospect_id: savedId,
                  business_name: businessName,
                  confidence: confidenceBreakdown.score,
                });
              }

              if (savedId) _prospectIds[toolUse.id] = savedId;

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  prospect_id: savedId,
                  confidence: confidenceBreakdown.score,
                  deduped: wasDedup,
                }),
              });

              // Auto-run: if confidence clears threshold, provision demo + draft email inline.
              // Skip for dedup'd prospects (they probably already have a demo + draft).
              if (savedId && !wasDedup && confidenceBreakdown.score >= AUTO_RUN_CONFIDENCE_THRESHOLD) {
                send({
                  type: "step",
                  step_type: "decision",
                  message: `Confidence ${Math.round(confidenceBreakdown.score * 100)}% — auto-provisioning demo and drafting email`,
                });
                try {
                  const provResult = await provisionDemoForProspect(savedId);
                  if (provResult.ok) {
                    send({
                      type: "step",
                      step_type: "found",
                      message: `Demo ready at ${provResult.phone_number} (${provResult.kb_chunks ?? 0} KB chunks)`,
                    });
                  } else {
                    send({
                      type: "step",
                      step_type: "decision",
                      message: `Auto-provision skipped: ${provResult.error}`,
                    });
                  }
                  const draftResult = await draftEmailForProspect(savedId);
                  if (draftResult.ok) {
                    send({
                      type: "email_drafted",
                      prospect_id: savedId,
                      subject: draftResult.subject,
                    });
                  } else {
                    send({
                      type: "step",
                      step_type: "decision",
                      message: `Auto-draft failed: ${draftResult.error}`,
                    });
                  }
                } catch (err) {
                  send({
                    type: "step",
                    step_type: "decision",
                    message: `Auto-run error: ${err instanceof Error ? err.message : String(err)}`,
                  });
                }
              }
            } else if (toolUse.name === "draft_email") {
              const prospectId = input.prospect_id;

              send({
                type: "step",
                step_type: "decision",
                message: `Drafting email for prospect ${prospectId} — subject: "${input.subject}"`,
              });

              const { error: draftErr } = await supabaseAdmin
                .from("outreach_prospects")
                .update({
                  email_draft_subject: input.subject,
                  email_draft_body: input.body,
                  email_approved: false,
                })
                .eq("id", prospectId);

              if (draftErr) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: `Error saving draft: ${draftErr.message}`,
                  is_error: true,
                });
              } else {
                await logProspectEvent({
                  prospect_id: prospectId,
                  event_type: "email_drafted",
                  summary: `Email draft: "${input.subject}"`,
                  actor: "agent:research",
                });
                send({
                  type: "email_drafted",
                  prospect_id: prospectId,
                  subject: input.subject,
                });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: "Email draft saved. It will NOT be sent until admin approves.",
                });
              }
            }
            // web_search is handled fully server-side by the API;
            // we never need to return a tool_result for it
          }

          if (toolResults.length > 0) {
            messages.push({ role: "user", content: toolResults });
          }
        }

        send({ type: "done", message: "Research complete. Review prospects and approve emails below." });
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
