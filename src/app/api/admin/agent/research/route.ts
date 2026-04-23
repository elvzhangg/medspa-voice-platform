import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";

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
          description: "Individual procedures/services with details. Each: { name, description, duration_min, price, notes }",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              duration_min: { type: "number" },
              price: { type: "string", description: "e.g. '$300' or 'from $12/unit'" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
        providers: {
          type: "array",
          description: "Medical/aesthetic providers on staff. Each: { name, title, specialties }",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              specialties: { type: "array", items: { type: "string" } },
              bio: { type: "string" },
            },
            required: ["name"],
          },
        },
        hours: {
          type: "object",
          description: "Operating hours keyed by day name (monday, tuesday, ...). Values can be { open, close } or a display string like '9am–6pm' or 'Closed'.",
          additionalProperties: true,
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

// Server-side tool (web_search) - handled automatically by Claude
const SERVER_TOOLS = [
  {
    type: "web_search_20260209" as const,
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
5. Use draft_email to write a personalized outreach email. Admin approves before anything sends.

Structured data rules:
- procedures[]: list each distinct service as its own entry with name, short description, duration_min if stated, price if stated ("from $12/unit", "$300", etc.). Botox, fillers, laser hair removal, IPL, microneedling, hydrafacials, body contouring, etc. each get their own row.
- providers[]: each staff member on the "Our Team" / "Providers" page. Include title (MD, NP, PA, RN, Aesthetician) and specialties.
- hours: keyed by day (monday..sunday). Use display strings like "9am–6pm" or "Closed" — don't invent values.
- owner_name / owner_email: look for "Medical Director", "Founder", "Owner" on About pages. Distinguish from generic info@ emails — the direct owner email, if stated, is far more valuable for outreach.
- research_sources[]: record which URLs you actually fetched and which fields came from each. This becomes the audit trail.
- research_confidence: 0.8–1.0 if you found everything on their own site with pricing; 0.5–0.7 if relying on third-party aggregators or missing pricing; below 0.5 if large gaps.

Hard rules:
- Only save real, verifiable businesses
- 5–10 high-quality prospects, not a flood of low-confidence ones
- NEVER fabricate. Missing field > made-up field.
- Personalize each email — reference specific procedures, the city, their booking platform, how VauxVoice books directly into Acuity/Boulevard/Mindbody
- Emails warm, professional, under 200 words

VauxVoice value prop: AI handles incoming calls 24/7, books appointments directly into their existing system, dramatically reduces missed calls and front-desk overhead.

Start now.`,
          },
        ];

        // Maps save_prospect tool_use_id → saved prospect DB id (for draft_email references)
        const _prospectIds: Record<string, string> = {};

        let continueLoop = true;
        while (continueLoop) {
          const response = await anthropic.beta.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 8000,
            thinking: { type: "enabled", budget_tokens: 4000 },
            tools: [...SERVER_TOOLS, ...CUSTOM_TOOLS] as Anthropic.Tool[],
            messages,
            betas: ["web-search-2026-02-09"],
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

              send({
                type: "step",
                step_type: "found",
                message: `Saving prospect: ${businessName} (${city}, ${state})`,
              });

              const { data: saved, error: saveErr } = await supabaseAdmin
                .from("outreach_prospects")
                .insert({
                  campaign_id,
                  business_name: businessName,
                  website: rawInput.website ?? null,
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
                  hours: rawInput.hours ?? null,
                  social_links: rawInput.social_links ?? null,
                  research_sources: rawInput.research_sources ?? null,
                  research_confidence: typeof rawInput.research_confidence === "number" ? rawInput.research_confidence : null,
                  researched_at: new Date().toISOString(),
                  services_summary: rawInput.services_summary ?? null,
                  pricing_notes: rawInput.pricing_notes ?? null,
                  notes: rawInput.notes ?? null,
                  status: "researched",
                })
                .select("id")
                .single();

              if (saveErr || !saved) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: `Error saving: ${saveErr?.message ?? "unknown error"}`,
                  is_error: true,
                });
              } else {
                _prospectIds[toolUse.id] = saved.id;
                const proceduresLen = Array.isArray(rawInput.procedures) ? rawInput.procedures.length : 0;
                const providersLen = Array.isArray(rawInput.providers) ? rawInput.providers.length : 0;
                await logProspectEvent({
                  prospect_id: saved.id,
                  event_type: "researched",
                  summary: `Research agent saved ${businessName} — ${proceduresLen} procedures, ${providersLen} providers${typeof rawInput.research_confidence === "number" ? `, confidence ${Math.round(rawInput.research_confidence * 100)}%` : ""}`,
                  actor: "agent:research",
                });
                send({
                  type: "prospect_saved",
                  prospect_id: saved.id,
                  business_name: businessName,
                });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: JSON.stringify({ prospect_id: saved.id }),
                });
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
