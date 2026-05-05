import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
// pdf-parse v2 exposes a PDFParse class (not a default function). Each
// instance loads one buffer and exposes getText / getInfo / etc.
import { PDFParse } from "pdf-parse";

/**
 * Shared PDF text-extraction endpoint. Used by:
 *   - Post-Procedure Guidelines modal (parse aftercare PDF → guideline_text)
 *   - Clinic Handbook add/edit forms (parse handbook PDF → KB document content)
 *
 * Input:  multipart/form-data with a single `file` field, PDF only.
 * Output: { text, filename, pages } on success.
 *
 * The PDF itself isn't stored — extracted text is what each caller saves
 * back to its own table. If we ever need to keep originals (audit,
 * versioning), add a Storage bucket + a separate persistence flow.
 *
 * Limits:
 *   - 5 MB upload cap (Vercel serverless body limit, gives us headroom)
 *   - PDF mime-type check (reject .docx, images, etc. for now)
 *   - Authenticated tenant only
 */

export const runtime = "nodejs"; // pdf-parse needs Node, not edge

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Multipart parse
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read upload" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Expected a file under the 'file' field" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  // Mime check — relaxed: some browsers send application/octet-stream for
  // PDFs from Drive / iCloud. Trust the .pdf extension as a fallback.
  const isPdfByType = file.type === "application/pdf";
  const isPdfByName = (file.name || "").toLowerCase().endsWith(".pdf");
  if (!isPdfByType && !isPdfByName) {
    return NextResponse.json(
      { error: "Only PDF uploads are supported right now." },
      { status: 415 }
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();

    // pdf-parse strips most PDF junk but leaves whitespace. Normalize so
    // the extracted text drops cleanly into a textarea.
    const text = (parsed.text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        {
          error:
            "Couldn't read any text from this PDF. It may be a scan / image-only PDF — try a text-based PDF or paste the content manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text,
      filename: file.name || "upload.pdf",
      pages: parsed.total ?? 0,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("PDF_EXTRACT_ERR:", detail);
    return NextResponse.json(
      { error: "Failed to parse PDF. " + detail.slice(0, 200) },
      { status: 500 }
    );
  }
}
