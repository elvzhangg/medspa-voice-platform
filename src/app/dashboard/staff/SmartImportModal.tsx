"use client";

import { useState } from "react";

/**
 * Smart import modal for the Providers page. Three input methods:
 *   - URL: paste a link to a services or team page; we fetch + scrape
 *   - Text: paste a service menu / bio block directly
 *   - PDF: upload a service-menu PDF (parsed via pdf-parse)
 *
 * Flow:
 *   Step 1: pick input method, hit "Extract"
 *   Step 2: review extracted providers + services, edit inline if needed
 *   Step 3: hit "Apply" → bulk merges into staff table + booking_settings
 *
 * We deliberately keep the preview view minimally editable — names,
 * services, and duration only. Anything more requires a trip to the
 * regular staff form afterward.
 */

type InputKind = "url" | "text" | "pdf";

interface Provider {
  name: string;
  title: string | null;
  services: string[];
  specialties: string[];
  ai_notes: string | null;
}

interface Service {
  name: string;
  duration_min: number | null;
  price: string | null;
  category: string | null;
}

interface ExtractResult {
  source: string;
  providers: Provider[];
  services: Service[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful apply so the parent can refetch staff. */
  onApplied: () => void;
}

export default function SmartImportModal({ open, onClose, onApplied }: Props) {
  const [kind, setKind] = useState<InputKind>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractResult | null>(null);

  function reset() {
    setKind("url");
    setUrl("");
    setText("");
    setFile(null);
    setExtracted(null);
    setError(null);
    setExtracting(false);
    setApplying(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleExtract() {
    setError(null);
    setExtracting(true);
    try {
      let res: Response;
      if (kind === "pdf") {
        if (!file) {
          setError("Please choose a PDF file");
          setExtracting(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/staff/import", { method: "POST", body: fd });
      } else {
        const value = (kind === "url" ? url : text).trim();
        if (!value) {
          setError(kind === "url" ? "Paste a URL first" : "Paste some text first");
          setExtracting(false);
          return;
        }
        res = await fetch("/api/staff/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, value }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Extraction failed");
        setExtracting(false);
        return;
      }

      setExtracted(data as ExtractResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function handleApply() {
    if (!extracted) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: extracted.providers,
          services: extracted.services,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Apply failed");
        setApplying(false);
        return;
      }
      onApplied();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  // Inline editors for the preview
  function updateProvider(idx: number, patch: Partial<Provider>) {
    if (!extracted) return;
    const next = [...extracted.providers];
    next[idx] = { ...next[idx], ...patch };
    setExtracted({ ...extracted, providers: next });
  }
  function removeProvider(idx: number) {
    if (!extracted) return;
    setExtracted({
      ...extracted,
      providers: extracted.providers.filter((_, i) => i !== idx),
    });
  }
  function updateService(idx: number, patch: Partial<Service>) {
    if (!extracted) return;
    const next = [...extracted.services];
    next[idx] = { ...next[idx], ...patch };
    setExtracted({ ...extracted, services: next });
  }
  function removeService(idx: number) {
    if (!extracted) return;
    setExtracted({
      ...extracted,
      services: extracted.services.filter((_, i) => i !== idx),
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-zinc-100">
          <h2 className="font-serif text-2xl text-zinc-900">Smart import</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Paste a link, text, or PDF and we&apos;ll extract your providers and services
            automatically. You&apos;ll review before anything is saved.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!extracted && (
            <>
              {/* Kind selector */}
              <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
                {(["url", "text", "pdf"] as InputKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-3 h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                      kind === k
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                  >
                    {k === "url" ? "URL" : k === "text" ? "Paste text" : "PDF"}
                  </button>
                ))}
              </div>

              {/* Inputs */}
              {kind === "url" && (
                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                    URL of your services or team page
                  </label>
                  <input
                    type="url"
                    placeholder="https://glowmedspa.com/team"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                  />
                  <p className="text-xs text-zinc-500 mt-1.5">
                    We&apos;ll fetch the page, strip the markup, and extract structured data.
                  </p>
                </div>
              )}
              {kind === "text" && (
                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                    Paste your service menu, team list, or any descriptive text
                  </label>
                  <textarea
                    rows={10}
                    placeholder="e.g.&#10;Sarah Chen, Nurse Injector — specializes in lip filler and Botox&#10;HydraFacial: 60 min, $250&#10;Botox: $15/unit&#10;..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none font-mono text-xs"
                  />
                </div>
              )}
              {kind === "pdf" && (
                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                    Upload a service-menu or brochure PDF
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block text-sm text-zinc-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-zinc-900 file:text-white file:cursor-pointer hover:file:bg-zinc-800"
                  />
                  {file && (
                    <p className="text-xs text-zinc-500 mt-2">
                      Ready: <span className="font-mono">{file.name}</span> ({Math.round(file.size / 1024)} KB)
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={extracting}
                  onClick={handleExtract}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {extracting ? "Extracting…" : "Extract"}
                </button>
              </div>
            </>
          )}

          {extracted && (
            <div className="space-y-5">
              <div className="text-xs text-zinc-500">
                Extracted from <span className="font-mono">{extracted.source}</span>. Review,
                edit, or remove rows before applying.
              </div>

              {/* Providers preview */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-700 mb-2">
                  Providers ({extracted.providers.length})
                </h3>
                {extracted.providers.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No providers detected.</p>
                ) : (
                  <div className="space-y-2">
                    {extracted.providers.map((p, i) => (
                      <div
                        key={i}
                        className="border border-zinc-200 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex gap-2 items-start">
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => updateProvider(i, { name: e.target.value })}
                            className="flex-1 px-2 py-1 text-sm font-semibold rounded-lg border border-zinc-200"
                          />
                          <input
                            type="text"
                            placeholder="Title"
                            value={p.title ?? ""}
                            onChange={(e) =>
                              updateProvider(i, { title: e.target.value || null })
                            }
                            className="w-40 px-2 py-1 text-sm rounded-lg border border-zinc-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeProvider(i)}
                            className="text-xs text-zinc-400 hover:text-rose-600 px-2"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Services (comma-separated)"
                          value={p.services.join(", ")}
                          onChange={(e) =>
                            updateProvider(i, {
                              services: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200"
                        />
                        {p.ai_notes && (
                          <textarea
                            rows={2}
                            placeholder="AI notes"
                            value={p.ai_notes ?? ""}
                            onChange={(e) =>
                              updateProvider(i, { ai_notes: e.target.value || null })
                            }
                            className="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Services preview */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-700 mb-2">
                  Services ({extracted.services.length})
                </h3>
                {extracted.services.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No services detected.</p>
                ) : (
                  <div className="space-y-1.5">
                    {extracted.services.map((s, i) => (
                      <div
                        key={i}
                        className="flex gap-2 items-center text-xs border border-zinc-200 rounded-lg px-2 py-1.5"
                      >
                        <input
                          type="text"
                          value={s.name}
                          onChange={(e) => updateService(i, { name: e.target.value })}
                          className="flex-1 px-2 py-1 rounded-md border border-zinc-200 text-sm"
                        />
                        <input
                          type="number"
                          placeholder="min"
                          value={s.duration_min ?? ""}
                          onChange={(e) =>
                            updateService(i, {
                              duration_min: e.target.value
                                ? parseInt(e.target.value, 10)
                                : null,
                            })
                          }
                          className="w-20 px-2 py-1 rounded-md border border-zinc-200 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="price"
                          value={s.price ?? ""}
                          onChange={(e) =>
                            updateService(i, { price: e.target.value || null })
                          }
                          className="w-28 px-2 py-1 rounded-md border border-zinc-200 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeService(i)}
                          className="text-zinc-400 hover:text-rose-600 px-2"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {error && (
                <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-between pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setExtracted(null)}
                  className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
                >
                  ← Re-extract
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={handleApply}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                  >
                    {applying ? "Applying…" : "Apply to providers + scheduling"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
