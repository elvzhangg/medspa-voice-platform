import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

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
      "Save a discovered med spa prospect to the database. Only save businesses that are real, have a working website, and are genuinely likely to benefit from an AI voice receptionist.",
    input_schema: {
      type: "object" as const,
      properties: {
        business_name: { type: "string", description: "Name of the med spa" },
        website: { type: "string", description: "Website URL" },
        email: {
          type: "string",
          description: "Contact email if found, otherwise null",
        },
        phone: { type: "string", description: "Phone number if found" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State (CA or NY)" },
        booking_platform: {
          type: "string",
          enum: ["Acuity", "Boulevard", "Mindbody", "Other", "Unknown"],
          description: "Booking platform they use",
        },
        services_summary: {
          type: "string",
          description: "Brief summary of services offered",
        },
        pricing_notes: {
          type: "string",
          description: "Any pricing information found",
        },
        notes: {
          type: "string",
          description: "Any other relevant notes about this prospect",
        },
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

For each prospect you find:
1. Use log_step to document your reasoning throughout
2. Use web_search to find real businesses and verify their details
3. Use save_prospect to save each confirmed prospect
4. Use draft_email to write a personalized outreach email (it will NOT be sent — it needs admin approval first)

Rules:
- Only save real businesses with verifiable websites
- Find 5-10 high-quality prospects, not a large quantity of unverified ones
- Personalize each email — reference the specific business, their location, their booking platform
- Keep emails warm but professional, under 200 words
- NEVER fabricate information — if you can't verify something, say so in notes
- Log your reasoning clearly so the admin can understand your process

VauxVoice value proposition: AI handles incoming calls 24/7, books appointments directly into their existing system (Acuity/Boulevard/Mindbody), dramatically reducing missed calls and front-desk overhead.

Start researching now. Use log_step frequently to explain what you're doing and why.`,
          },
        ];

        // Maps save_prospect tool_use_id → saved prospect DB id (for draft_email references)
        const _prospectIds: Record<string, string> = {};

        let continueLoop = true;
        while (continueLoop) {
          const response = await anthropic.beta.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 8000,
            thinking: { type: "adaptive" },
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

          // Add assistant message to history
          messages.push({ role: "assistant", content: response.content });

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
              send({
                type: "step",
                step_type: "found",
                message: `Saving prospect: ${input.business_name} (${input.city}, ${input.state})`,
              });

              const { data: saved, error: saveErr } = await supabaseAdmin
                .from("outreach_prospects")
                .insert({
                  campaign_id,
                  business_name: input.business_name,
                  website: input.website ?? null,
                  email: input.email ?? null,
                  phone: input.phone ?? null,
                  city: input.city,
                  state: input.state,
                  booking_platform: input.booking_platform ?? "Unknown",
                  services_summary: input.services_summary ?? null,
                  pricing_notes: input.pricing_notes ?? null,
                  notes: input.notes ?? null,
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
                send({
                  type: "prospect_saved",
                  prospect_id: saved.id,
                  business_name: input.business_name,
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
