"use client";

import { useRef, useState } from "react";

/**
 * "Upload PDF" button shared between Post-Procedure Guidelines and the
 * Clinic Handbook (and any future page that wants to populate a textarea
 * from a PDF). Calls /api/uploads/pdf-extract, then hands the parsed
 * text back to the host page via onExtracted so the host can decide
 * what to do (overwrite, append, prompt for review).
 *
 * Stays out of the way visually — small secondary button, never the
 * primary action. Manual text entry remains the primary path.
 */

interface Props {
  /**
   * Called when the PDF parses successfully. The host typically pre-fills
   * a textarea with `text` so the user can review/edit before saving.
   */
  onExtracted: (args: { text: string; filename: string; pages: number }) => void;
  /** Optional override — defaults to "Upload PDF". */
  label?: string;
  /** Optional className override for the button. */
  className?: string;
}

const DEFAULT_BUTTON_CLASS =
  "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-zinc-300 text-zinc-700 hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function PdfUploadButton({
  onExtracted,
  label = "Upload PDF",
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads/pdf-extract", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      onExtracted({
        text: data.text,
        filename: data.filename,
        pages: data.pages,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Allow re-uploading the same filename (browsers skip change events
      // when the value hasn't changed otherwise).
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={className ?? DEFAULT_BUTTON_CLASS}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        {uploading ? "Reading PDF…" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {error && (
        <span className="text-[11px] text-rose-600 font-medium">{error}</span>
      )}
    </div>
  );
}
