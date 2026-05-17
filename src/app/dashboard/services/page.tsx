"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_min: number | null;
  price_display: string | null;
  price_cents: number | null;
  active: boolean;
  display_order: number;
  source: "manual" | "pdf";
  source_filename: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftService {
  name: string;
  description?: string;
  category?: string;
  duration_min?: number;
  price_display?: string;
}

interface ExtractResponse {
  services: DraftService[];
  filename: string;
  truncated?: boolean;
}

const UNCATEGORIZED = "Uncategorized";

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Editing state (one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditableFields>(blankEdit());
  const [savingEdit, setSavingEdit] = useState(false);

  // New-service inline form
  const [addOpen, setAddOpen] = useState(false);
  const [newForm, setNewForm] = useState<EditableFields>(blankEdit());
  const [savingNew, setSavingNew] = useState(false);

  // PDF upload + review
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<DraftReviewItem[]>([]);
  const [reviewMeta, setReviewMeta] = useState<{ filename: string; truncated: boolean } | null>(null);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/services", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setServices(data.services ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (!showInactive && !s.active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [services, search, showInactive]);

  // Group by category, preserving insertion order so the user's own
  // ordering wins over alphabetical reshuffling.
  const grouped = useMemo(() => {
    const groups = new Map<string, Service[]>();
    for (const s of visible) {
      const key = s.category?.trim() || UNCATEGORIZED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries());
  }, [visible]);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      description: s.description ?? "",
      category: s.category ?? "",
      duration_min: s.duration_min?.toString() ?? "",
      price_display: s.price_display ?? "",
      active: s.active,
    });
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    const payload = serializeEdit(editForm);
    const res = await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingEdit(false);
    if (res.ok) {
      setEditingId(null);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Failed to save");
    }
  }

  async function deleteService(s: Service) {
    if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/services/${s.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      alert("Failed to delete");
    }
  }

  async function toggleActive(s: Service) {
    await fetch(`/api/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    await load();
  }

  async function saveNew(e: React.FormEvent) {
    e.preventDefault();
    setSavingNew(true);
    const payload = serializeEdit(newForm);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingNew(false);
    if (res.ok) {
      setAddOpen(false);
      setNewForm(blankEdit());
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Failed to create");
    }
  }

  async function onPdfChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    setReviewItems([]);
    setReviewMeta(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/services/extract-pdf", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.error ?? "Failed to parse PDF");
        return;
      }
      const data = (await res.json()) as ExtractResponse;
      if (!data.services?.length) {
        setUploadError("Couldn't pull any services out of that PDF — try entering them manually.");
        return;
      }
      // Default every draft to approved=true so the operator can deselect
      // the noise rather than re-tick the keepers.
      setReviewItems(
        data.services.map((s, i) => ({
          ...s,
          _id: i,
          approved: true,
        }))
      );
      setReviewMeta({ filename: data.filename, truncated: !!data.truncated });
    } finally {
      setUploading(false);
    }
  }

  async function saveDrafts() {
    const approved = reviewItems
      .filter((r) => r.approved && r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        description: r.description?.trim() || null,
        category: r.category?.trim() || null,
        duration_min: r.duration_min != null ? r.duration_min : null,
        price_display: r.price_display?.trim() || null,
        source: "pdf" as const,
        source_filename: reviewMeta?.filename,
      }));
    if (approved.length === 0) {
      alert("Nothing checked to save.");
      return;
    }
    setSavingDrafts(true);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: approved }),
    });
    setSavingDrafts(false);
    if (res.ok) {
      setReviewItems([]);
      setReviewMeta(null);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Failed to save");
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Services & Pricing</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your service menu. Used internally; the AI receptionist will reference these when
            callers ask about treatments and pricing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPdfChosen(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white border border-zinc-300 text-zinc-700 hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <>Parsing PDF…</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.9A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload pricing PDF
              </>
            )}
          </button>
          <button
            disabled
            title="Coming soon — push this menu into the searchable Clinic Handbook so the AI can answer fuzzy questions about it too."
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white border border-zinc-200 text-zinc-400 cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync to Knowledge Base
          </button>
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add service
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {uploadError}
        </div>
      )}

      {/* PDF review banner */}
      {reviewItems.length > 0 && reviewMeta && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-900 text-sm">
                Review {reviewItems.length} extracted service{reviewItems.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                From <span className="font-mono">{reviewMeta.filename}</span>
                {reviewMeta.truncated && " · note: PDF was long, only the first portion was parsed"}
                . Uncheck anything wrong before saving — these aren't in your menu yet.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setReviewItems([]);
                  setReviewMeta(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                Discard
              </button>
              <button
                onClick={saveDrafts}
                disabled={savingDrafts}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {savingDrafts ? "Saving…" : `Save ${reviewItems.filter((r) => r.approved).length} selected`}
              </button>
            </div>
          </div>
          <div className="divide-y divide-amber-100">
            {reviewItems.map((r) => (
              <DraftRow
                key={r._id}
                row={r}
                onChange={(patch) =>
                  setReviewItems((prev) =>
                    prev.map((x) => (x._id === r._id ? { ...x, ...patch } : x))
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="px-3 py-2 text-sm border border-zinc-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-600"
          />
          Show inactive
        </label>
      </div>

      {/* New-service inline form */}
      {addOpen && (
        <form onSubmit={saveNew} className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900 text-sm mb-3">New service</h2>
          <EditForm form={newForm} setForm={setNewForm} />
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={savingNew}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingNew ? "Saving…" : "Save service"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setNewForm(blankEdit());
              }}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-zinc-200">
          <p className="text-sm font-medium text-zinc-500 mb-1">
            {services.length === 0 ? "No services yet" : "No matches"}
          </p>
          <p className="text-xs text-zinc-400">
            {services.length === 0
              ? "Add your first service or upload a pricing PDF to populate the menu."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, items]) => (
            <div key={category} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <header className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/60 flex items-center justify-between">
                <h2 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">{category}</h2>
                <span className="text-xs text-zinc-400">{items.length}</span>
              </header>
              <div className="divide-y divide-zinc-100">
                {items.map((s) => (
                  <div key={s.id} className={`px-5 py-3 ${!s.active ? "opacity-60" : ""}`}>
                    {editingId === s.id ? (
                      <div>
                        <EditForm form={editForm} setForm={setEditForm} />
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => saveEdit(s.id)}
                            disabled={savingEdit}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-zinc-900">{s.name}</p>
                            {!s.active && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                                Inactive
                              </span>
                            )}
                            {s.source === "pdf" && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                From PDF
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-sm text-zinc-600 mt-0.5">{s.description}</p>
                          )}
                          <div className="flex gap-3 text-xs text-zinc-400 mt-1">
                            {s.duration_min != null && <span>{s.duration_min} min</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {s.price_display ? (
                            <p className="text-sm font-semibold text-zinc-800">{s.price_display}</p>
                          ) : (
                            <p className="text-xs text-zinc-300 italic">no price</p>
                          )}
                          <div className="flex gap-3 justify-end mt-1.5">
                            <button
                              onClick={() => toggleActive(s)}
                              className="text-xs text-zinc-400 hover:text-zinc-700"
                              title={s.active ? "Mark inactive" : "Mark active"}
                            >
                              {s.active ? "Hide" : "Show"}
                            </button>
                            <button
                              onClick={() => startEdit(s)}
                              className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteService(s)}
                              className="text-xs text-zinc-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditableFields {
  name: string;
  description: string;
  category: string;
  duration_min: string;
  price_display: string;
  active: boolean;
}

function blankEdit(): EditableFields {
  return {
    name: "",
    description: "",
    category: "",
    duration_min: "",
    price_display: "",
    active: true,
  };
}

function serializeEdit(f: EditableFields) {
  const duration =
    f.duration_min.trim() === "" ? null : Math.max(0, Math.round(Number(f.duration_min) || 0));
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    category: f.category.trim() || null,
    duration_min: duration,
    price_display: f.price_display.trim() || null,
    active: f.active,
  };
}

function EditForm({
  form,
  setForm,
}: {
  form: EditableFields;
  setForm: (f: EditableFields) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Service name" required className="col-span-2">
        <input
          required
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="Botox"
        />
      </FormField>
      <FormField label="Category">
        <input
          type="text"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="Injectables"
        />
      </FormField>
      <FormField label="Duration (min)">
        <input
          type="number"
          min={0}
          value={form.duration_min}
          onChange={(e) => setForm({ ...form, duration_min: e.target.value })}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="30"
        />
      </FormField>
      <FormField label="Price" className="col-span-2">
        <input
          type="text"
          value={form.price_display}
          onChange={(e) => setForm({ ...form, price_display: e.target.value })}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="from $12/unit"
        />
      </FormField>
      <FormField label="Description" className="col-span-2">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
          placeholder="Quick 15-minute treatment for fine lines"
        />
      </FormField>
      <label className="col-span-2 inline-flex items-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded accent-amber-600"
        />
        Active (visible on the menu)
      </label>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      {children}
    </div>
  );
}

interface DraftReviewItem extends DraftService {
  _id: number;
  approved: boolean;
}

function DraftRow({
  row,
  onChange,
}: {
  row: DraftReviewItem;
  onChange: (patch: Partial<DraftReviewItem>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`px-5 py-3 ${!row.approved ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.approved}
          onChange={(e) => onChange({ approved: e.target.checked })}
          className="mt-1 w-4 h-4 rounded accent-amber-600 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <input
              type="text"
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="font-medium text-zinc-900 bg-transparent border-b border-transparent hover:border-zinc-200 focus:border-amber-400 focus:outline-none px-0.5"
            />
            {row.category && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
                {row.category}
              </span>
            )}
          </div>
          {expanded ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input
                type="text"
                value={row.category ?? ""}
                onChange={(e) => onChange({ category: e.target.value })}
                placeholder="Category"
                className="text-xs px-2 py-1 border border-zinc-200 rounded"
              />
              <input
                type="number"
                value={row.duration_min ?? ""}
                onChange={(e) =>
                  onChange({
                    duration_min: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="Duration (min)"
                className="text-xs px-2 py-1 border border-zinc-200 rounded"
              />
              <input
                type="text"
                value={row.price_display ?? ""}
                onChange={(e) => onChange({ price_display: e.target.value })}
                placeholder="Price"
                className="text-xs px-2 py-1 border border-zinc-200 rounded"
              />
              <textarea
                value={row.description ?? ""}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={2}
                placeholder="Description"
                className="col-span-3 text-xs px-2 py-1 border border-zinc-200 rounded resize-y"
              />
            </div>
          ) : (
            row.description && (
              <p className="text-xs text-zinc-500 mt-0.5 truncate">{row.description}</p>
            )
          )}
        </div>
        <div className="text-right shrink-0 text-xs">
          {row.price_display && <p className="font-semibold text-zinc-700">{row.price_display}</p>}
          {row.duration_min != null && <p className="text-zinc-400">{row.duration_min} min</p>}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-amber-600 hover:text-amber-800 font-medium mt-0.5"
          >
            {expanded ? "Done" : "Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}
