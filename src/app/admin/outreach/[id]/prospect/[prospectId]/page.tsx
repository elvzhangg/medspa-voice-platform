"use client";

import { useState, useEffect, use, useMemo } from "react";
import Link from "next/link";
import OpsChat from "./OpsChat";

interface Prospect {
  id: string;
  campaign_id: string;
  business_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  booking_platform: string | null;
  services_summary: string | null;
  pricing_notes: string | null;
  status: string;
  assigned_demo_number: string | null;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  researched_at: string | null;
  demo_provisioned_at: string | null;
  demo_call_count: number;
  demo_last_called_at: string | null;
  email_draft_subject: string | null;
  email_draft_body: string | null;
  email_approved: boolean;
  email_sent_at: string | null;
  email_opened_at: string | null;
  email_reply_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_title: string | null;
  locations: Array<{ label?: string; address?: string; phone?: string; hours?: string }> | null;
  procedures: Array<{ name: string; description?: string; duration_min?: number; price?: string | number; notes?: string }> | null;
  pricing: Record<string, Array<{ item: string; price: string | number; notes?: string }>> | Array<{ item: string; price: string | number }> | null;
  providers: Array<{ name: string; title?: string; specialties?: string[]; bio?: string }> | null;
  hours: Record<string, { open: string; close: string } | string> | null;
  social_links: Record<string, string> | null;
  research_sources: Array<{ url: string; fetched_at?: string }> | null;
  research_confidence: number | null;
  agent_notes: string | null;
  demo_tenant_id: string | null;
}

interface DemoTenant {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  voice_id: string;
  greeting_message: string;
  status: string | null;
  created_at: string;
}

interface CallLog {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  actor: string | null;
  created_at: string;
}

interface CampaignChip {
  id: string;
  name: string;
  added_at: string;
}

interface ConfidenceBreakdown {
  score: number;
  total_points: number;
  missing: string[];
  strengths: string[];
}

const STATUS_OPTIONS = ["new", "researched", "contacted", "demo_scheduled", "demo_tested", "converted", "archived"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-600",
  researched: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  demo_scheduled: "bg-purple-100 text-purple-700",
  demo_tested: "bg-indigo-100 text-indigo-700",
  converted: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-400",
};

const EVENT_ICONS: Record<string, string> = {
  researched: "🔍",
  demo_provisioned: "📞",
  email_drafted: "✉️",
  email_sent: "📤",
  email_opened: "👀",
  email_replied: "💬",
  demo_called: "📱",
  status_changed: "🔄",
  note_added: "📝",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string; prospectId: string }>;
}) {
  const { id: campaignId, prospectId } = use(params);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [demoTenant, setDemoTenant] = useState<DemoTenant | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignChip[]>([]);
  const [confidence, setConfidence] = useState<ConfidenceBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [opsChatOpen, setOpsChatOpen] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/admin/outreach-prospects/${prospectId}`);
      if (!res.ok) {
        setError("Prospect not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProspect(data.prospect);
      setDemoTenant(data.demo_tenant);
      setCallLogs(data.call_logs ?? []);
      setEvents(data.events ?? []);
      setCampaigns(data.campaigns ?? []);
      setConfidence(data.confidence ?? null);
    } catch {
      setError("Failed to load prospect.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  async function updateStatus(status: string) {
    if (!prospect) return;
    await fetch(`/api/admin/outreach-prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function toggleApproval() {
    if (!prospect) return;
    await fetch(`/api/admin/outreach-prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_approved: !prospect.email_approved }),
    });
    load();
  }

  async function provisionDemo() {
    if (!prospect || provisioning) return;
    setProvisioning(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/agent/provision-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospect.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ kind: "error", text: data.error ?? "Provisioning failed" });
      } else if (data.already_provisioned) {
        setActionMsg({ kind: "success", text: `Demo already provisioned: ${data.phone_number}` });
      } else {
        setActionMsg({ kind: "success", text: `Demo ready — ${data.phone_number} (${data.kb_chunks} KB chunks)` });
      }
      await load();
    } catch (err) {
      setActionMsg({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setProvisioning(false);
    }
  }

  async function draftEmail() {
    if (!prospect || draftingEmail) return;
    setDraftingEmail(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/agent/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospect.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ kind: "error", text: data.error ?? "Draft failed" });
      } else {
        setActionMsg({ kind: "success", text: `Email draft ready — review & approve` });
      }
      await load();
    } catch (err) {
      setActionMsg({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setDraftingEmail(false);
    }
  }

  async function sendNow() {
    if (!prospect || sendingNow) return;
    if (!prospect.email_approved) {
      setActionMsg({ kind: "error", text: "Approve the draft first." });
      return;
    }
    if (!confirm(`Send outreach email to ${prospect.owner_email ?? prospect.email}?`)) return;
    setSendingNow(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/agent/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_ids: [prospect.id] }),
      });
      const data = await res.json();
      const r = data.results?.[0];
      if (r?.status === "sent") {
        setActionMsg({ kind: "success", text: `Sent to ${r.to}` });
      } else if (r?.status === "simulated") {
        setActionMsg({ kind: "success", text: `Simulated send to ${r.to} (no Resend key)` });
      } else {
        setActionMsg({ kind: "error", text: r?.error ?? "Send failed" });
      }
      await load();
    } catch (err) {
      setActionMsg({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSendingNow(false);
    }
  }

  const totalCallDuration = useMemo(
    () => callLogs.reduce((acc, l) => acc + (l.duration_seconds ?? 0), 0),
    [callLogs]
  );

  if (loading) return <p className="text-sm text-gray-400">Loading prospect…</p>;
  if (error || !prospect) return <p className="text-sm text-red-500">{error ?? "Prospect not found."}</p>;

  const procedures = prospect.procedures ?? [];
  const providers = prospect.providers ?? [];
  const locations = prospect.locations ?? [];
  const hasStructuredPricing = Array.isArray(prospect.pricing)
    ? prospect.pricing.length > 0
    : prospect.pricing && Object.keys(prospect.pricing).length > 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/admin/outreach" className="hover:text-gray-600">All campaigns</Link>
          <span>›</span>
          <Link href={`/admin/outreach/${campaignId}`} className="hover:text-gray-600">Campaign</Link>
          <span>›</span>
          <span className="text-gray-600">{prospect.business_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 flex-wrap">
              {prospect.business_name}
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                  STATUS_COLORS[prospect.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {prospect.status.replace("_", " ")}
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
            </div>
            {campaigns.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-xs text-gray-400">In campaigns:</span>
                {campaigns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/outreach/${c.id}`}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                      c.id === campaignId
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => setOpsChatOpen(true)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 flex items-center gap-1.5"
              title="Open Ops Chat — talk to the agent about this prospect"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Ops Chat
            </button>
            <button
              onClick={provisionDemo}
              disabled={provisioning || !!prospect.demo_tenant_id}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title={prospect.demo_tenant_id ? "Demo already provisioned" : "Create Vapi demo agent for this prospect"}
            >
              {provisioning ? "Provisioning…" : prospect.demo_tenant_id ? "✓ Demo ready" : "Provision Demo"}
            </button>
            <button
              onClick={draftEmail}
              disabled={draftingEmail}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              title={prospect.email_draft_subject ? "Regenerate email draft" : "Draft outreach email"}
            >
              {draftingEmail ? "Drafting…" : prospect.email_draft_subject ? "Regenerate Email" : "Draft Email"}
            </button>
            <button
              onClick={sendNow}
              disabled={sendingNow || !prospect.email_approved || !!prospect.email_sent_at}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                prospect.email_sent_at
                  ? `Already sent ${new Date(prospect.email_sent_at).toLocaleDateString()}`
                  : !prospect.email_approved
                    ? "Approve the draft first"
                    : "Send to recipient now"
              }
            >
              {sendingNow ? "Sending…" : prospect.email_sent_at ? "✓ Sent" : "Send Now"}
            </button>
            <select
              value={prospect.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        {actionMsg && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
              actionMsg.kind === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
            }`}
          >
            {actionMsg.text}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Business info + Demo agent */}
        <div className="lg:col-span-2 space-y-6">
          {/* Panel 1: Business Info */}
          <Panel title="Business Info" subtitle="From research agent — editable">
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
              {confidence && (
                <Field label="Data completeness">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        confidence.score >= 0.7
                          ? "bg-emerald-50 text-emerald-700"
                          : confidence.score >= 0.5
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {Math.round(confidence.score * 100)}%
                    </span>
                    {confidence.missing.length > 0 && (
                      <span className="text-xs text-gray-400">
                        Missing: {confidence.missing.slice(0, 4).join(", ")}
                        {confidence.missing.length > 4 ? `, +${confidence.missing.length - 4} more` : ""}
                      </span>
                    )}
                  </div>
                </Field>
              )}
              <Field label="Researched">{fmtDate(prospect.researched_at)}</Field>
            </div>

            {/* Locations */}
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

            {/* Procedures */}
            {procedures.length > 0 && (
              <Subsection title={`Procedures (${procedures.length})`}>
                <div className="space-y-1.5">
                  {procedures.map((p, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">{p.name}</p>
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

            {/* Providers */}
            {providers.length > 0 && (
              <Subsection title={`Providers (${providers.length})`}>
                <div className="flex flex-wrap gap-2">
                  {providers.map((prov, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5 text-xs">
                      <p className="font-medium text-gray-800">{prov.name}</p>
                      {prov.title && <p className="text-gray-500">{prov.title}</p>}
                      {prov.specialties && prov.specialties.length > 0 && (
                        <p className="text-gray-400 mt-0.5">{prov.specialties.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Subsection>
            )}

            {/* Hours */}
            {prospect.hours && Object.keys(prospect.hours).length > 0 && (
              <Subsection title="Hours">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {Object.entries(prospect.hours).map(([day, val]) => (
                    <div key={day} className="flex justify-between">
                      <span className="capitalize text-gray-500">{day}</span>
                      <span className="text-gray-800 font-mono">
                        {typeof val === "string" ? val : `${val.open}–${val.close}`}
                      </span>
                    </div>
                  ))}
                </div>
              </Subsection>
            )}

            {/* Fallback flat text from older records */}
            {procedures.length === 0 && prospect.services_summary && (
              <Subsection title="Services (unstructured)">
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{prospect.services_summary}</p>
              </Subsection>
            )}
            {!hasStructuredPricing && prospect.pricing_notes && (
              <Subsection title="Pricing notes (unstructured)">
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{prospect.pricing_notes}</p>
              </Subsection>
            )}
          </Panel>

          {/* Panel 2: Demo Agent */}
          <Panel title="Demo Agent" subtitle="The AI receptionist provisioned for this prospect">
            {prospect.demo_tenant_id && demoTenant ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label="Demo phone number">
                    <span className="font-mono text-gray-900">
                      {demoTenant.phone_number || prospect.assigned_demo_number || <Muted />}
                    </span>
                  </Field>
                  <Field label="Voice">{demoTenant.voice_id}</Field>
                  <Field label="Provisioned">{fmtDate(prospect.demo_provisioned_at)}</Field>
                  <Field label="Demo tenant status">{demoTenant.status ?? "—"}</Field>
                </div>

                <Subsection title="Call stats">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <Stat label="Total calls" value={String(prospect.demo_call_count)} />
                    <Stat label="Total duration" value={fmtDuration(totalCallDuration)} />
                    <Stat label="Last called" value={prospect.demo_last_called_at ? fmtDate(prospect.demo_last_called_at) : "—"} />
                  </div>
                </Subsection>

                {callLogs.length > 0 && (
                  <Subsection title="Recent calls">
                    <div className="space-y-2">
                      {callLogs.map((c) => (
                        <div key={c.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                          <div className="flex justify-between items-start">
                            <p className="font-mono text-xs text-gray-600">{c.caller_number ?? "Unknown caller"}</p>
                            <p className="text-xs text-gray-400">{fmtDate(c.created_at)}</p>
                          </div>
                          {c.summary && <p className="text-xs text-gray-500 mt-1">{c.summary}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDuration(c.duration_seconds)}</p>
                        </div>
                      ))}
                    </div>
                  </Subsection>
                )}
              </>
            ) : (
              <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-600">No demo agent yet</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  {prospect.assigned_demo_number
                    ? `Manual demo number on file: ${prospect.assigned_demo_number}. Provisioning will replace it with a dedicated Vapi agent.`
                    : "Provision a dedicated Vapi agent trained on this prospect's data so they can call it themselves."}
                </p>
                <button
                  onClick={provisionDemo}
                  disabled={provisioning}
                  className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-40"
                >
                  {provisioning ? "Provisioning…" : "Provision Demo Agent"}
                </button>
              </div>
            )}
          </Panel>
        </div>

        {/* Right column: Outreach + Timeline */}
        <div className="space-y-6">
          {/* Panel 3: Outreach */}
          <Panel title="Outreach" subtitle="Email draft + delivery status">
            {prospect.email_draft_subject || prospect.email_draft_body ? (
              <>
                <div className="space-y-3 text-sm">
                  <Field label="Subject">{prospect.email_draft_subject ?? <Muted />}</Field>
                  <Field label="To">
                    {prospect.owner_email ?? prospect.email ?? <span className="text-amber-600">No address</span>}
                  </Field>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={toggleApproval}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        prospect.email_approved
                          ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {prospect.email_approved ? "Unapprove" : "Approve"}
                    </button>
                    <button
                      onClick={() => setShowDraftPreview(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
                    >
                      Preview
                    </button>
                  </div>
                </div>

                <Subsection title="Delivery">
                  <div className="space-y-1 text-xs">
                    <DeliveryRow label="Sent" at={prospect.email_sent_at} />
                    <DeliveryRow label="Opened" at={prospect.email_opened_at} />
                    <DeliveryRow label="Replied" at={prospect.email_reply_at} />
                  </div>
                </Subsection>
              </>
            ) : (
              <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-600">No email drafted yet</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  Generate a personalized outreach email using this prospect&apos;s structured profile
                  {prospect.demo_tenant_id ? " and demo number." : ". Provision the demo first for a stronger CTA."}
                </p>
                <button
                  onClick={draftEmail}
                  disabled={draftingEmail}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
                >
                  {draftingEmail ? "Drafting…" : "Draft Email"}
                </button>
              </div>
            )}
          </Panel>

          {/* Panel 4: Timeline */}
          <Panel title="Timeline" subtitle="Every event for this prospect">
            {events.length === 0 ? (
              <p className="text-xs text-gray-400">No events yet.</p>
            ) : (
              <ol className="space-y-3 relative">
                <span className="absolute left-[11px] top-1 bottom-1 w-px bg-gray-100" aria-hidden />
                {events.map((ev) => (
                  <li key={ev.id} className="flex gap-3 relative">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs z-10">
                      {EVENT_ICONS[ev.event_type] ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-sm text-gray-800">{ev.summary ?? ev.event_type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(ev.created_at)}
                        {ev.actor && <span className="ml-2">· {ev.actor}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <OpsChat
        prospectId={prospect.id}
        open={opsChatOpen}
        onClose={() => setOpsChatOpen(false)}
        onDataChanged={load}
      />

      {/* Draft preview modal */}
      {showDraftPreview && prospect.email_draft_body && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Email Draft</p>
                <h2 className="font-semibold text-gray-900">{prospect.business_name}</h2>
              </div>
              <button onClick={() => setShowDraftPreview(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject</p>
              <p className="text-sm font-medium text-gray-800 mb-4">{prospect.email_draft_subject}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Body</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-gray-100">
                {prospect.email_draft_body}
              </div>
            </div>
          </div>
        </div>
      )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function DeliveryRow({ label, at }: { label: string; at: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={at ? "text-gray-800 font-medium" : "text-gray-300"}>{at ? fmtDate(at) : "—"}</span>
    </div>
  );
}

function Muted() {
  return <span className="text-gray-300">—</span>;
}
