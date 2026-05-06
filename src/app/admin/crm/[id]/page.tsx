"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type Stage = "top_of_funnel" | "crm" | "rejected";

interface Procedure {
  name: string;
  description?: string;
  duration_min?: number;
  price?: string | number;
  notes?: string;
  source_url?: string;
}
interface Provider {
  name: string;
  title?: string;
  specialties?: string[];
  bio?: string;
  source_url?: string;
}
interface LocationEntry {
  label?: string;
  address?: string;
  phone?: string;
  hours?: string;
}
interface FaqEntry {
  question: string;
  answer: string;
  source_url?: string;
}
interface ResearchSource {
  url: string;
  fetched_at?: string;
  fields_extracted?: string[];
}
interface VerificationNotes {
  google_business_profile_url?: string;
  yelp_url?: string;
  address_confirmed_by?: string[];
  phone_confirmed_by?: string[];
  still_operating?: boolean;
  discrepancies?: string[];
}

interface Prospect {
  id: string;
  business_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  booking_platform: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_title: string | null;
  locations: LocationEntry[] | null;
  procedures: Procedure[] | null;
  providers: Provider[] | null;
  business_hours: Record<string, { open?: string; close?: string } | string> | null;
  faqs: FaqEntry[] | null;
  services_summary: string | null;
  pricing_notes: string | null;
  research_sources: ResearchSource[] | null;
  verification_notes: VerificationNotes | null;
  research_confidence: number | null;
  agent_notes: string | null;
  researched_at: string | null;
  notes: string | null;
  crm_stage: Stage;
  crm_promoted_at: string | null;
  created_at: string;
  updated_at: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  top_of_funnel: "Top of Funnel",
  crm: "CRM",
  rejected: "Rejected",
};
const STAGE_COLORS: Record<Stage, string> = {
  top_of_funnel: "bg-gray-100 text-gray-700",
  crm: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface EditableFields {
  business_name: string;
  website: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  booking_platform: string;
  owner_name: string;
  owner_email: string;
  owner_title: string;
  services_summary: string;
  pricing_notes: string;
  notes: string;
}

function blankEditForm(): EditableFields {
  return {
    business_name: "",
    website: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    address: "",
    booking_platform: "",
    owner_name: "",
    owner_email: "",
    owner_title: "",
    services_summary: "",
    pricing_notes: "",
    notes: "",
  };
}

const PLATFORM_OPTIONS = ["Acuity", "Boulevard", "Mindbody", "Other"];

export default function CrmProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Edit mode for the basic + contact fields. Rich agent-collected JSONB
  // (procedures, providers, hours, FAQs, sources) stays read-only — those
  // are extraction outputs, not human-curated.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditableFields>(blankEditForm());
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/crm/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load prospect");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setProspect(data.prospect);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function moveTo(stage: Stage) {
    if (!prospect) return;
    if (stage === "rejected" && !confirm(`Reject "${prospect.business_name}"?`)) return;
    setActing(true);
    setActionMsg(null);
    const res = await fetch(`/api/admin/crm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crm_stage: stage }),
    });
    setActing(false);
    if (res.ok) {
      const data = await res.json();
      setProspect(data.prospect);
      setActionMsg({ kind: "ok", text: `Moved to ${STAGE_LABEL[stage]}` });
    } else {
      const err = await res.json().catch(() => ({}));
      setActionMsg({ kind: "error", text: err.error ?? "Failed to update" });
    }
  }

  function beginEdit() {
    if (!prospect) return;
    setEditForm({
      business_name: prospect.business_name ?? "",
      website: prospect.website ?? "",
      email: prospect.email ?? "",
      phone: prospect.phone ?? "",
      city: prospect.city ?? "",
      state: prospect.state ?? "",
      address: prospect.address ?? "",
      booking_platform: prospect.booking_platform ?? "",
      owner_name: prospect.owner_name ?? "",
      owner_email: prospect.owner_email ?? "",
      owner_title: prospect.owner_title ?? "",
      services_summary: prospect.services_summary ?? "",
      pricing_notes: prospect.pricing_notes ?? "",
      notes: prospect.notes ?? "",
    });
    setEditing(true);
    setActionMsg(null);
  }

  async function saveEdit() {
    if (!prospect) return;
    setSavingEdit(true);
    setActionMsg(null);
    // Convert "" → null so empty fields clear in the database rather than
    // staying as empty strings (which would still satisfy a `NOT NULL` check
    // and pollute filters).
    const payload: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(editForm)) {
      payload[k] = v.trim() === "" ? null : v.trim();
    }
    const res = await fetch(`/api/admin/crm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingEdit(false);
    if (res.ok) {
      const data = await res.json();
      setProspect(data.prospect);
      setEditing(false);
      setActionMsg({ kind: "ok", text: "Saved changes" });
    } else {
      const err = await res.json().catch(() => ({}));
      setActionMsg({ kind: "error", text: err.error ?? "Failed to save" });
    }
  }

  async function deleteProspect() {
    if (!prospect) return;
    if (!confirm(`Delete "${prospect.business_name}" permanently?`)) return;
    setActing(true);
    const res = await fetch(`/api/admin/crm/${id}`, { method: "DELETE" });
    setActing(false);
    if (res.ok) {
      window.location.href = "/admin/crm";
    } else {
      setActionMsg({ kind: "error", text: "Failed to delete" });
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (error || !prospect) return <p className="text-sm text-red-500">{error ?? "Not found"}</p>;

  const procedures = prospect.procedures ?? [];
  const providers = prospect.providers ?? [];
  const locations = prospect.locations ?? [];
  const faqs = prospect.faqs ?? [];
  const sources = prospect.research_sources ?? [];

  const stageOptions: Stage[] = (["top_of_funnel", "crm", "rejected"] as Stage[]).filter(
    (s) => s !== prospect.crm_stage
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/admin/crm" className="hover:text-gray-600">CRM</Link>
          <span>›</span>
          <span className="text-gray-600">{prospect.business_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 flex-wrap">
              {prospect.business_name}
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[prospect.crm_stage]}`}
              >
                {STAGE_LABEL[prospect.crm_stage]}
              </span>
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500 flex-wrap">
              {prospect.website && (
                <a
                  href={prospect.website.startsWith("http") ? prospect.website : `https://${prospect.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  {prospect.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {(prospect.city || prospect.state) && (
                <span>{[prospect.city, prospect.state].filter(Boolean).join(", ")}</span>
              )}
              {prospect.booking_platform && (
                <span className="text-xs font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                  {prospect.booking_platform}
                </span>
              )}
              {prospect.research_confidence != null && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    prospect.research_confidence >= 0.7
                      ? "bg-emerald-50 text-emerald-700"
                      : prospect.research_confidence >= 0.5
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {Math.round(prospect.research_confidence * 100)}% confidence
                </span>
              )}
            </div>
          </div>

          {/* Stage actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {!editing && (
              <button
                onClick={beginEdit}
                disabled={acting}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Edit
              </button>
            )}
            {prospect.crm_stage !== "crm" && (
              <button
                onClick={() => moveTo("crm")}
                disabled={acting}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Add to CRM
              </button>
            )}
            {prospect.crm_stage !== "top_of_funnel" && (
              <button
                onClick={() => moveTo("top_of_funnel")}
                disabled={acting}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Send to Top of Funnel
              </button>
            )}
            {prospect.crm_stage !== "rejected" && (
              <button
                onClick={() => moveTo("rejected")}
                disabled={acting}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Reject
              </button>
            )}
            <button
              onClick={deleteProspect}
              disabled={acting}
              className="px-3 py-2 text-xs font-semibold rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-40"
              title="Delete permanently"
            >
              Delete
            </button>
            {/* Stage select fallback (in case the user wants the explicit dropdown) */}
            {stageOptions.length > 0 && (
              <select
                value={prospect.crm_stage}
                onChange={(e) => moveTo(e.target.value as Stage)}
                className="hidden text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={prospect.crm_stage}>{STAGE_LABEL[prospect.crm_stage]}</option>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {actionMsg && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
              actionMsg.kind === "ok"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-red-50 text-red-700 border border-red-100"
            }`}
          >
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* Single panel containing all the rich fields. Two-column layout for
          contact info; everything else stacks. */}
      <Panel title="Business Info" subtitle={editing ? "Editing — changes save to the database" : "From research agent (click Edit to change)"}>
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <EditField label="Business name" className="col-span-2" value={editForm.business_name} onChange={(v) => setEditForm({ ...editForm, business_name: v })} />
              <EditField label="Owner name" value={editForm.owner_name} onChange={(v) => setEditForm({ ...editForm, owner_name: v })} />
              <EditField label="Owner title" value={editForm.owner_title} onChange={(v) => setEditForm({ ...editForm, owner_title: v })} placeholder="Owner, Medical Director…" />
              <EditField label="Owner email" type="email" value={editForm.owner_email} onChange={(v) => setEditForm({ ...editForm, owner_email: v })} />
              <EditField label="General email" type="email" value={editForm.email} onChange={(v) => setEditForm({ ...editForm, email: v })} placeholder="info@…" />
              <EditField label="Phone" value={editForm.phone} onChange={(v) => setEditForm({ ...editForm, phone: v })} />
              <EditField label="Website" value={editForm.website} onChange={(v) => setEditForm({ ...editForm, website: v })} placeholder="example.com" />
              <EditField label="City" value={editForm.city} onChange={(v) => setEditForm({ ...editForm, city: v })} />
              <EditField label="State" value={editForm.state} onChange={(v) => setEditForm({ ...editForm, state: v })} placeholder="CA" />
              <EditField label="Address" className="col-span-2" value={editForm.address} onChange={(v) => setEditForm({ ...editForm, address: v })} />
              <div className="col-span-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Booking platform</p>
                <select
                  value={editForm.booking_platform}
                  onChange={(e) => setEditForm({ ...editForm, booking_platform: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">— Unknown —</option>
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <EditField label="Services summary" multiline className="col-span-2" value={editForm.services_summary} onChange={(v) => setEditForm({ ...editForm, services_summary: v })} placeholder="Botox, fillers, laser…" />
              <EditField label="Pricing notes" multiline className="col-span-2" value={editForm.pricing_notes} onChange={(v) => setEditForm({ ...editForm, pricing_notes: v })} />
              <EditField label="Internal notes" multiline className="col-span-2" value={editForm.notes} onChange={(v) => setEditForm({ ...editForm, notes: v })} placeholder="High call volume, missed connection from Q1…" />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={savingEdit}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Owner / Manager">
              {prospect.owner_name ? (
                <span>
                  {prospect.owner_name}
                  {prospect.owner_title && <span className="text-gray-400"> · {prospect.owner_title}</span>}
                </span>
              ) : (
                <Muted />
              )}
            </Field>
            <Field label="Owner email">
              {prospect.owner_email ? (
                <a href={`mailto:${prospect.owner_email}`} className="text-indigo-600 hover:underline">
                  {prospect.owner_email}
                </a>
              ) : (
                <Muted />
              )}
            </Field>
            <Field label="General email">
              {prospect.email ? (
                <a href={`mailto:${prospect.email}`} className="text-indigo-600 hover:underline">
                  {prospect.email}
                </a>
              ) : (
                <Muted />
              )}
            </Field>
            <Field label="Phone">{prospect.phone ?? <Muted />}</Field>
            <Field label="Address" className="col-span-2">
              {prospect.address ?? <Muted />}
            </Field>
            <Field label="Researched">{fmtDate(prospect.researched_at)}</Field>
            <Field label="Added to CRM">{fmtDate(prospect.crm_promoted_at)}</Field>
          </div>
        )}

        {locations.length > 0 && (
          <Subsection title={`Locations (${locations.length})`}>
            <div className="space-y-2">
              {locations.map((loc, i) => (
                <div key={i} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-800">{loc.label ?? `Location ${i + 1}`}</p>
                  {loc.address && <p className="text-xs text-gray-500 mt-0.5">{loc.address}</p>}
                  <div className="flex gap-3 text-xs text-gray-400 mt-1">
                    {loc.phone && <span>{loc.phone}</span>}
                    {loc.hours && <span>{loc.hours}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Subsection>
        )}

        {procedures.length > 0 && (
          <Subsection title={`Procedures (${procedures.length})`}>
            <div className="space-y-1.5">
              {procedures.map((p, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 flex items-center gap-1.5">
                      {p.name}
                      {p.source_url && <SourceLink url={p.source_url} />}
                    </p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  <div className="text-right text-xs text-gray-500 shrink-0">
                    {p.duration_min != null && <p>{p.duration_min} min</p>}
                    {p.price != null && <p className="font-medium text-gray-700">{String(p.price)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Subsection>
        )}

        {providers.length > 0 && (
          <Subsection title={`Providers (${providers.length})`}>
            <div className="flex flex-wrap gap-2">
              {providers.map((prov, i) => (
                <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5 text-xs">
                  <p className="font-medium text-gray-800 flex items-center gap-1.5">
                    {prov.name}
                    {prov.source_url && <SourceLink url={prov.source_url} />}
                  </p>
                  {prov.title && <p className="text-gray-500">{prov.title}</p>}
                  {prov.specialties && prov.specialties.length > 0 && (
                    <p className="text-gray-400 mt-0.5">{prov.specialties.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </Subsection>
        )}

        {prospect.business_hours && Object.keys(prospect.business_hours).length > 0 && (
          <Subsection title="Hours">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {Object.entries(prospect.business_hours).map(([day, val]) => (
                <div key={day} className="flex justify-between">
                  <span className="capitalize text-gray-500">{day}</span>
                  <span className="text-gray-800 font-mono">
                    {typeof val === "string" ? val : `${val.open ?? ""}–${val.close ?? ""}`}
                  </span>
                </div>
              ))}
            </div>
          </Subsection>
        )}

        {faqs.length > 0 && (
          <Subsection title={`FAQs (${faqs.length})`}>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <details key={i} className="rounded-lg border border-gray-100 px-3 py-2 text-sm group">
                  <summary className="font-medium text-gray-800 cursor-pointer list-none flex items-center gap-2">
                    <span className="text-gray-400 text-xs group-open:rotate-90 transition-transform">▸</span>
                    <span className="flex-1">{faq.question}</span>
                    {faq.source_url && <SourceLink url={faq.source_url} />}
                  </summary>
                  <p className="text-xs text-gray-600 mt-2 ml-5 whitespace-pre-wrap">{faq.answer}</p>
                </details>
              ))}
            </div>
          </Subsection>
        )}

        {prospect.verification_notes && (
          <Subsection title="Verification">
            <VerificationDisplay v={prospect.verification_notes} />
          </Subsection>
        )}

        {sources.length > 0 && (
          <Subsection title={`Research sources (${sources.length})`}>
            <div className="space-y-1">
              {sources.map((s, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline truncate flex-1 min-w-0"
                  >
                    {s.url.replace(/^https?:\/\//, "").slice(0, 80)}
                  </a>
                  {s.fields_extracted && s.fields_extracted.length > 0 && (
                    <span className="text-gray-400 shrink-0">→ {s.fields_extracted.join(", ")}</span>
                  )}
                </div>
              ))}
            </div>
          </Subsection>
        )}

        {procedures.length === 0 && prospect.services_summary && (
          <Subsection title="Services (unstructured)">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{prospect.services_summary}</p>
          </Subsection>
        )}
        {prospect.pricing_notes && (
          <Subsection title="Pricing notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{prospect.pricing_notes}</p>
          </Subsection>
        )}
        {prospect.notes && (
          <Subsection title="Internal notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{prospect.notes}</p>
          </Subsection>
        )}
        {prospect.agent_notes && (
          <Subsection title="Agent notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap italic border-l-2 border-violet-200 pl-3">
              {prospect.agent_notes}
            </p>
          </Subsection>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <header className="mb-4">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  );
}

function Muted() {
  return <span className="text-gray-300">—</span>;
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Source: ${url}`}
      className="inline-flex items-center text-gray-300 hover:text-indigo-600 transition-colors"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    </a>
  );
}

function VerificationDisplay({ v }: { v: VerificationNotes }) {
  const addressSources = v.address_confirmed_by ?? [];
  const phoneSources = v.phone_confirmed_by ?? [];
  const stillOperating = v.still_operating;
  const hasDiscrepancies = v.discrepancies && v.discrepancies.length > 0;

  return (
    <div className="space-y-2 text-sm">
      {stillOperating !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-2 py-0.5 rounded-full font-semibold ${
              stillOperating ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {stillOperating ? "✓ Currently operating" : "⚠ No recent activity"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-400 mb-0.5">Address confirmed by</p>
          {addressSources.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {addressSources.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{s}</span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300">— not cross-checked</span>
          )}
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Phone confirmed by</p>
          {phoneSources.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {phoneSources.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{s}</span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300">— not cross-checked</span>
          )}
        </div>
      </div>

      {(v.google_business_profile_url || v.yelp_url) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {v.google_business_profile_url && (
            <a href={v.google_business_profile_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Google Business Profile ↗
            </a>
          )}
          {v.yelp_url && (
            <a href={v.yelp_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Yelp ↗
            </a>
          )}
        </div>
      )}

      {hasDiscrepancies && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <p className="text-xs font-semibold text-amber-700 mb-1">Discrepancies found:</p>
          <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
            {v.discrepancies?.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
