import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentTenant } from "@/lib/supabase-server";
import { PDFParse } from "pdf-parse";

// POST /api/services/extract-pdf — multipart/form-data with a `file` field.
//
// Pulls text out of the PDF, asks Claude to structure it into services, and
// returns the draft list to the UI for review. Does NOT write to the DB —
// users review/edit/discard before calling POST /api/services to persist.
// That review gate is intentional: PDF extraction will occasionally fabricate
// or mis-parse pricing, and a wrong price on the spa's menu is high-stakes.

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface DraftService {
  name: string;
  description?: string;
  category?: string;
  duration_min?: number;
  price_display?: string;
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a `file` field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF only" }, { status: 400 });
  }

  // Extract text. Mirrors the shared /api/uploads/pdf-extract handler but
  // inlined so we can pass directly to Claude without an extra hop.
  const buf = Buffer.from(await file.arrayBuffer());
  let pageText: string;
  try {
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    pageText = result.text;
  } catch (err) {
    console.error("[services/extract-pdf] PDF parse failed", err);
    return NextResponse.json({ error: "Could not parse PDF" }, { status: 400 });
  }

  if (!pageText.trim()) {
    return NextResponse.json({ error: "PDF had no extractable text" }, { status: 400 });
  }

  // Cap the prompt input — long menu PDFs balloon token cost and the model
  // doesn't get better signal past the first ~12k chars.
  const TEXT_CAP = 12_000;
  const truncated = pageText.length > TEXT_CAP;
  const promptText = pageText.slice(0, TEXT_CAP);

  const systemPrompt = `You extract structured services + pricing from a med spa's menu PDF.

Return a JSON object: {"services":[{...},{...}]}

Each service: { "name": string, "description"?: string, "category"?: string, "duration_min"?: number, "price_display"?: string }

Rules:
- name is REQUIRED. Use the exact service name as written.
- description: 1 short sentence if present in the PDF; omit if the PDF doesn't include one. Never invent.
- category: free-text (Botox, Filler, Laser, Skincare, Membership, etc). Use the PDF's own section headers when available.
- duration_min: only when the PDF explicitly states it in minutes. Omit otherwise.
- price_display: lift the price verbatim — "$300", "from $12/unit", "starts at $650", "$99/month". Med-spa pricing is messy on purpose; preserve the wording.
- Skip non-service rows (intro text, footer, contact info, page numbers).
- If a service is listed without a price, INCLUDE it with no price_display rather than dropping it.

Return ONLY the JSON object. No prose, no markdown, no commentary.`;

  const userPrompt = `Source PDF text${truncated ? " (truncated)" : ""}:\n\n${promptText}`;

  let parsed: { services?: DraftService[] } = {};
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

    // Be lenient: the model occasionally wraps the JSON in a code fence.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[services/extract-pdf] LLM extract failed", err);
    return NextResponse.json(
      { error: "Could not structure the PDF text" },
      { status: 500 }
    );
  }

  const services: DraftService[] = Array.isArray(parsed.services)
    ? parsed.services.filter((s) => typeof s.name === "string" && s.name.trim())
    : [];

  return NextResponse.json({
    services,
    filename: file.name,
    char_count: pageText.length,
    truncated,
  });
}
