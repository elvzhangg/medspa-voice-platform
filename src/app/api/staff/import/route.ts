import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { getCurrentTenant } from "@/lib/supabase-server";

/**
 * POST /api/staff/import
 *
 * Extracts structured provider + service data from one of three sources:
 *
 *   JSON  { kind: "url",  value: "<full URL>" }      → fetch + strip HTML
 *   JSON  { kind: "text", value: "<arbitrary text>" }→ use as-is
 *   multipart/form-data with `file` (PDF only)       → pdf-parse
 *
 * Result is NOT applied to the DB — it's returned for the tenant to review
 * and edit on the UI before the apply step (POST /api/staff/import/apply).
 *
 * Auth: tenant session via getCurrentTenant.
 *
 * Why split extract vs apply: AI hallucinations into a tenant's roster
 * would be very disruptive. Tenant must approve the parse before any
 * staff/service data lands in the DB.
 */

export const runtime = "nodejs"; // pdf-parse needs Node runtime
export const maxDuration = 60; // Claude calls can take ~10-30s

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB upload cap (matches pdf-extract route)
const MAX_TEXT_CHARS = 60_000; // ~15k tokens — fits Opus context with headroom

interface ExtractedProvider {
  name: string;
  title: string | null;
  services: string[];
  specialties: string[];
  ai_notes: string | null;
}

interface ExtractedService {
  name: string;
  duration_min: number | null;
  price: string | null;
  category: string | null;
}

interface ExtractedPayload {
  providers: ExtractedProvider[];
  services: ExtractedService[];
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  let rawText: string;
  let sourceLabel: string;

  try {
    if (contentType.includes("multipart/form-data")) {
      const result = await readPdf(req);
      rawText = result.text;
      sourceLabel = result.filename ?? "uploaded PDF";
    } else {
      const body = (await req.json()) as { kind?: string; value?: string };
      if (body.kind === "url") {
        const result = await readUrl(body.value ?? "");
        rawText = result.text;
        sourceLabel = body.value ?? "url";
      } else if (body.kind === "text") {
        rawText = (body.value ?? "").trim();
        if (rawText.length === 0) {
          return NextResponse.json(
            { error: "Pasted text was empty" },
            { status: 400 }
          );
        }
        sourceLabel = "pasted text";
      } else {
        return NextResponse.json(
          { error: "Unknown input kind. Expected 'url' or 'text', or multipart upload." },
          { status: 400 }
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read input" },
      { status: 400 }
    );
  }

  // Cap text length so we don't overrun Claude's context. Truncating from
  // the front rather than the back because med-spa team/service pages
  // usually put the meaningful content in the first chunk; nav and
  // footer markup that survives HTML stripping is more often at the end.
  if (rawText.length > MAX_TEXT_CHARS) {
    rawText = rawText.slice(0, MAX_TEXT_CHARS);
  }

  // Call Claude with tool_use for guaranteed JSON output
  let extracted: ExtractedPayload;
  try {
    extracted = await extractWithClaude(rawText);
  } catch (err) {
    console.error("STAFF_IMPORT_CLAUDE_ERR:", err);
    return NextResponse.json(
      {
        error:
          "AI extraction failed. The service may be temporarily unavailable; try again or paste text instead of a URL.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    source: sourceLabel,
    charCount: rawText.length,
    ...extracted,
  });
}

// ---------------------------------------------------------------------------
// Source readers
// ---------------------------------------------------------------------------

async function readPdf(req: NextRequest): Promise<{ text: string; filename: string | null }> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new Error("Expected a file under the 'file' field");
  }
  if (!file.type.includes("pdf")) {
    throw new Error("Only PDF uploads are supported");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`PDF too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return { text: result.text ?? "", filename: file.name ?? null };
}

async function readUrl(url: string): Promise<{ text: string }> {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Provide a full http(s) URL");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // Some sites gate on UA; pretend to be a regular browser
        "User-Agent":
          "Mozilla/5.0 (compatible; VauxVoice-Importer/1.0; +https://vauxvoice.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Don't follow infinite redirects or get stuck on slow sites
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) {
    throw new Error(`URL returned ${res.status}: ${res.statusText}`);
  }
  const html = await res.text();
  // Naive HTML → text: strip script/style blocks, then tags. Leaves the
  // visible textual content roughly intact. Claude is tolerant of mild
  // markup soup, so we don't need a full parser.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { text };
}

// ---------------------------------------------------------------------------
// Claude extraction — uses tool_use for guaranteed structured output
// ---------------------------------------------------------------------------

async function extractWithClaude(text: string): Promise<ExtractedPayload> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are extracting structured data from a med spa's website page or document. The text below was scraped from a services page, team page, brochure, or service menu.

Your job is to identify every PROVIDER (a person — nurse, aesthetician, doctor) and every SERVICE (a treatment offered) that's clearly named in the text. Don't invent names. Don't guess. If something isn't clearly a provider or service, skip it.

Common provider titles: Nurse Injector, Master Aesthetician, Lead Aesthetician, RN, NP, MD, PA, Owner, Founder, Lead Provider.

Common services: Botox, Dysport, Filler (lip filler, cheek filler, etc.), HydraFacial, Microneedling, Laser hair removal, IPL Photofacial, Chemical peel, Lip flip, Kybella, Sculptra, PRP, Microblading, Lash lift.

Output via the extract_med_spa_data tool only.`;

  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system: systemPrompt,
    tools: [
      {
        name: "extract_med_spa_data",
        description:
          "Submit the providers and services parsed from the input text.",
        input_schema: {
          type: "object",
          properties: {
            providers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Full name of the provider" },
                  title: {
                    type: ["string", "null"],
                    description: "Job title, e.g. 'Nurse Injector', 'Master Aesthetician'. Null if not stated.",
                  },
                  services: {
                    type: "array",
                    items: { type: "string" },
                    description: "Services this specific provider performs (e.g. ['Botox', 'Filler']). Empty if not specified.",
                  },
                  specialties: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specialty tags like 'first-time clients', 'lip injections', 'anxious patients'. Empty if not specified.",
                  },
                  ai_notes: {
                    type: ["string", "null"],
                    description: "A 1-2 sentence summary the AI receptionist can read aloud when describing this provider. Null if no descriptive content.",
                  },
                },
                required: ["name", "title", "services", "specialties", "ai_notes"],
              },
            },
            services: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Service name, e.g. 'Botox', 'HydraFacial'" },
                  duration_min: {
                    type: ["number", "null"],
                    description: "Typical appointment length in minutes if stated. Null otherwise.",
                  },
                  price: {
                    type: ["string", "null"],
                    description: "Price as written, e.g. '$15/unit', '$300', 'Starting at $250'. Null if not stated.",
                  },
                  category: {
                    type: ["string", "null"],
                    description: "Category if stated, e.g. 'Injectables', 'Skincare', 'Body'. Null if not.",
                  },
                },
                required: ["name", "duration_min", "price", "category"],
              },
            },
          },
          required: ["providers", "services"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_med_spa_data" },
    messages: [
      {
        role: "user",
        content: `Extract every provider and service from this text. Don't invent — only include what's clearly stated.\n\n---\n${text}`,
      },
    ],
  });

  // Walk the response to find the tool_use block
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === "extract_med_spa_data") {
      const input = block.input as ExtractedPayload;
      // Defensive: ensure arrays exist
      return {
        providers: Array.isArray(input.providers) ? input.providers : [],
        services: Array.isArray(input.services) ? input.services : [],
      };
    }
  }
  throw new Error("Claude did not return tool_use output");
}
