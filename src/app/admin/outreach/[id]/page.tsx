"use client";

import { useState, useEffect, use, useRef } from "react";

interface Prospect {
  id: string;
  business_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  booking_platform: string | null;
  services_summary: string | null;
  pricing_notes: string | null;
  status: string;
  assigned_demo_number: string | null;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  email_draft_subject: string | null;
  email_draft_body: string | null;
  email_approved: boolean;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  target_regions: string[] | null;
  target_platforms: string[] | null;
}

interface AgentLogEntry {
  id: number;
  type: string;
  step_type?: string;
  message?: string;
  text?: string;
  business_name?: string;
  subject?: string;
}

const STATUS_OPTIONS = ["new", "researched", "contacted", "demo_scheduled", "demo_tested", "converted", "archived"] as const;
type ProspectStatus = typeof STATUS_OPTIONS[number];

const STATUS_COLORS: Record<ProspectStatus, string> = {
  new: "bg-gray-100 text-gray-600",
  researched: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  demo_scheduled: "bg-purple-100 text-purple-700",
  demo_tested: "bg-indigo-100 text-indigo-700",
  converted: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-400",
};

const STEP_ICONS: Record<string, string> = {
  thinking: "💭",
  searching: "🔍",
  found: "✅",
  decision: "📝",
  summary: "📋",
};

const PLATFORMS = ["Acuity", "Boulevard", "Mindbody", "Other"];

const EMPTY_FORM = {
  business_name: "",
  website: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  booking_platform: "",
  services_summary: "",
  pricing_notes: "",
  assigned_demo_number: "",
  notes: "",
};

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  // Agent state
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentDone, setAgentDone] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<Array<{ business_name: string; status: string }> | null>(null);
  const [previewProspect, setPreviewProspect] = useState<Prospect | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  async function load() {
    const [cRes, pRes] = await Promise.all([
      fetch(`/api/admin/outreach-campaigns`),
      fetch(`/api/admin/outreach-prospects?campaign_id=${id}`),
    ]);
    const cJson = await cRes.json();
    const pJson = await pRes.json();
    const found = cJson.campaigns?.find((c: Campaign) => c.id === id);
    setCampaign(found ?? null);
    setProspects(pJson.prospects ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  }

  function openEdit(p: Prospect) {
    setEditing(p);
    setForm({
      business_name: p.business_name,
      website: p.website ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      booking_platform: p.booking_platform ?? "",
      services_summary: p.services_summary ?? "",
      pricing_notes: p.pricing_notes ?? "",
      assigned_demo_number: p.assigned_demo_number ?? "",
      notes: p.notes ?? "",
    });
    setShowAdd(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      ...(editing ? { id: editing.id } : { campaign_id: id }),
    };
    await fetch("/api/admin/outreach-prospects", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  async function updateStatus(prospectId: string, status: string) {
    await fetch("/api/admin/outreach-prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospectId, status }),
    });
    load();
  }

  async function deleteProspect(prospectId: string) {
    if (!confirm("Delete this prospect?")) return;
    await fetch(`/api/admin/outreach-prospects?id=${prospectId}`, { method: "DELETE" });
    load();
  }

  async function toggleApproval(prospectId: string, currentlyApproved: boolean) {
    const newVal = !currentlyApproved;
    await fetch("/api/admin/outreach-prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospectId, email_approved: newVal }),
    });
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, email_approved: newVal } : p));
    setApprovedIds(prev => {
      const next = new Set(prev);
      if (newVal) next.add(prospectId); else next.delete(prospectId);
      return next;
    });
  }

  async function runAgent() {
    setAgentRunning(true);
    setAgentDone(false);
    setAgentLogs([]);
    setShowAgentPanel(true);
    setSendResults(null);

    try {
      const res = await fetch("/api/admin/agent/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: id }),
      });

      if (!res.ok || !res.body) {
        addLog({ type: "error", message: `Server error: ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            addLog(event);
            if (event.type === "done" || event.type === "error") {
              setAgentDone(true);
              await load();
            }
          } catch {
            // malformed JSON — skip
          }
        }
      }
    } catch (err) {
      addLog({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setAgentRunning(false);
      setAgentDone(true);
      await load();
    }
  }

  function addLog(event: Omit<AgentLogEntry, "id">) {
    setAgentLogs(prev => [...prev, { ...event, id: ++logIdRef.current }]);
  }

  async function sendApproved() {
    const toSend = prospects.filter(p => p.email_approved && p.email).map(p => p.id);
    if (!toSend.length) {
      alert("No approved prospects with email addresses found.");
      return;
    }
    if (!confirm(`Send outreach emails to ${toSend.length} approved prospect(s)?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin/agent/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_ids: toSend }),
      });
      const data = await res.json();
      setSendResults(data.results ?? []);
      await load();
    } finally {
      setSending(false);
    }
  }

  const filtered = filter === "all" ? prospects : prospects.filter(p => p.status === filter);
  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = prospects.filter(p => p.status === s).length;
    return acc;
  }, {} as Record<string, number>);
  const draftsCount = prospects.filter(p => p.email_draft_subject).length;
  const approvedCount = prospects.filter(p => p.email_approved).length;

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;
  if (!campaign) return <p className="text-sm text-red-500">Campaign not found.</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <a href="/admin/outreach" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            All campaigns
          </a>
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          {campaign.description && <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {campaign.target_regions?.join(", ")}
            {campaign.target_platforms && (
              <span>· {campaign.target_platforms.join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAgentPanel(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            AI Agent
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Prospect
          </button>
        </div>
      </div>

      {/* AI Agent Panel */}
      {showAgentPanel && (
        <div className="mb-8 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
          {/* Panel header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${agentRunning ? "bg-emerald-400 animate-pulse" : agentDone ? "bg-blue-400" : "bg-slate-600"}`} />
              <span className="text-white font-semibold text-sm">Research Agent</span>
              {agentRunning && <span className="text-xs text-slate-400">Running…</span>}
              {agentDone && !agentRunning && <span className="text-xs text-slate-400">Complete</span>}
            </div>
            <div className="flex items-center gap-2">
              {!agentRunning && (
                <button
                  onClick={runAgent}
                  className="px-3.5 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  {agentDone ? "Run Again" : "Run Agent"}
                </button>
              )}
              {agentRunning && (
                <span className="text-xs text-slate-500 italic">Finding med spas…</span>
              )}
            </div>
          </div>

          {/* Log stream */}
          {agentLogs.length > 0 && (
            <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-2 font-mono">
              {agentLogs.map((log) => {
                if (log.type === "step") {
                  const icon = STEP_ICONS[log.step_type ?? ""] ?? "▸";
                  const color = log.step_type === "found" ? "text-emerald-400" :
                                log.step_type === "thinking" ? "text-slate-400" :
                                log.step_type === "searching" ? "text-blue-400" :
                                log.step_type === "decision" ? "text-amber-400" : "text-slate-300";
                  return (
                    <div key={log.id} className={`flex gap-2.5 text-xs leading-relaxed ${color}`}>
                      <span className="shrink-0 mt-0.5">{icon}</span>
                      <span>{log.message}</span>
                    </div>
                  );
                }
                if (log.type === "prospect_saved") {
                  return (
                    <div key={log.id} className="flex gap-2.5 text-xs text-emerald-300 bg-emerald-950/40 rounded-lg px-3 py-2 border border-emerald-900/50">
                      <span>🏥</span>
                      <span>Saved: <strong>{log.business_name}</strong></span>
                    </div>
                  );
                }
                if (log.type === "email_drafted") {
                  return (
                    <div key={log.id} className="flex gap-2.5 text-xs text-violet-300 bg-violet-950/40 rounded-lg px-3 py-2 border border-violet-900/50">
                      <span>✉️</span>
                      <span>Email drafted — waiting for your approval</span>
                    </div>
                  );
                }
                if (log.type === "text") {
                  return (
                    <div key={log.id} className="text-xs text-slate-300 leading-relaxed border-l-2 border-slate-700 pl-3 ml-1">
                      {log.text}
                    </div>
                  );
                }
                if (log.type === "done") {
                  return (
                    <div key={log.id} className="flex gap-2.5 text-xs text-blue-300 bg-blue-950/40 rounded-lg px-3 py-2.5 border border-blue-900/50 mt-3">
                      <span>🎯</span>
                      <span className="font-semibold">{log.message}</span>
                    </div>
                  );
                }
                if (log.type === "error") {
                  return (
                    <div key={log.id} className="flex gap-2.5 text-xs text-red-300 bg-red-950/40 rounded-lg px-3 py-2 border border-red-900/50">
                      <span>⚠️</span>
                      <span>{log.message}</span>
                    </div>
                  );
                }
                return null;
              })}
              <div ref={logEndRef} />
            </div>
          )}

          {agentLogs.length === 0 && !agentRunning && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-slate-500 mb-1">AI Research Agent</p>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                Click <strong className="text-slate-400">Run Agent</strong> to automatically find med spas in {campaign.target_regions?.join(", ") ?? "CA/NY"} using {campaign.target_platforms?.join(", ") ?? "Acuity/Boulevard/Mindbody"}, research each one, and draft personalized outreach emails for your review.
              </p>
            </div>
          )}

          {/* Approval section */}
          {agentDone && draftsCount > 0 && (
            <div className="border-t border-slate-800 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">Email Approval</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {draftsCount} draft{draftsCount !== 1 ? "s" : ""} ready · {approvedCount} approved
                  </p>
                </div>
                <button
                  onClick={sendApproved}
                  disabled={sending || approvedCount === 0}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {sending ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                      </svg>
                      Send to {approvedCount} Approved
                    </>
                  )}
                </button>
              </div>

              {/* Prospect draft cards */}
              <div className="space-y-2">
                {prospects.filter(p => p.email_draft_subject).map(p => (
                  <div key={p.id} className={`flex items-start gap-3 rounded-xl px-4 py-3 border transition-colors ${p.email_approved ? "bg-emerald-950/30 border-emerald-900/60" : "bg-slate-900 border-slate-800"}`}>
                    <input
                      type="checkbox"
                      checked={p.email_approved}
                      onChange={() => toggleApproval(p.id, p.email_approved)}
                      className="mt-0.5 w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100 truncate">{p.business_name}</span>
                        {p.city && <span className="text-xs text-slate-500">{p.city}, {p.state}</span>}
                        {p.booking_platform && (
                          <span className="text-[10px] font-medium bg-violet-900/60 text-violet-300 px-1.5 py-0.5 rounded-full">{p.booking_platform}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {p.email ?? <span className="text-amber-500 italic">No email found</span>}
                      </p>
                      {p.email_draft_subject && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">✉️ {p.email_draft_subject}</p>
                      )}
                    </div>
                    {p.email_draft_body && (
                      <button
                        onClick={() => setPreviewProspect(p)}
                        className="shrink-0 text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
                      >
                        Preview
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Send results */}
              {sendResults && (
                <div className="mt-4 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-300 mb-2">Send Results</p>
                  {sendResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className={r.status === "sent" || r.status === "simulated" ? "text-emerald-400" : "text-red-400"}>
                        {r.status === "sent" ? "✓ Sent" : r.status === "simulated" ? "✓ Marked (no Resend key)" : `✗ ${r.status}`}
                      </span>
                      <span className="text-slate-400">{r.business_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          All ({prospects.length})
        </button>
        {STATUS_OPTIONS.map(s => statusCounts[s] > 0 && (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {s.replace("_", " ")} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {/* Prospects table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">No prospects yet</p>
          <p className="text-xs text-gray-400">Use the AI Agent to automatically find prospects, or add them manually.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Med Spa</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Draft</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-gray-900">{p.business_name}</p>
                    {p.website && (
                      <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline truncate block max-w-[160px]">
                        {p.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    {p.booking_platform ? (
                      <span className="text-xs font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                        {p.booking_platform}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {p.email ? (
                      <a href={`mailto:${p.email}`} className="text-indigo-500 hover:underline block">{p.email}</a>
                    ) : <span className="text-gray-300">—</span>}
                    {p.phone && <span className="text-gray-400 block">{p.phone}</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {p.email_draft_subject ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.email_approved}
                          onChange={() => toggleApproval(p.id, p.email_approved)}
                          title={p.email_approved ? "Approved — click to unapprove" : "Click to approve for sending"}
                          className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                        />
                        <button onClick={() => setPreviewProspect(p)} className="text-xs text-indigo-500 hover:underline max-w-[120px] truncate text-left">
                          {p.email_draft_subject}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      value={p.status}
                      onChange={e => updateStatus(p.id, e.target.value)}
                      className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-indigo-400 focus:outline-none capitalize ${STATUS_COLORS[p.status as ProspectStatus] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-indigo-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      <button onClick={() => deleteProspect(p.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Email draft preview modal */}
      {previewProspect && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Email Draft</p>
                <h2 className="font-semibold text-gray-900">{previewProspect.business_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{previewProspect.email ?? "No email address"}</p>
              </div>
              <button onClick={() => setPreviewProspect(null)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject</p>
              <p className="text-sm font-medium text-gray-800 mb-4">{previewProspect.email_draft_subject}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Body</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-gray-100">
                {previewProspect.email_draft_body}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { toggleApproval(previewProspect.id, previewProspect.email_approved); setPreviewProspect(null); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${previewProspect.email_approved ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
              >
                {previewProspect.email_approved ? "Unapprove" : "Approve to Send"}
              </button>
              <button onClick={() => setPreviewProspect(null)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-900">{editing ? "Edit Prospect" : "Add Prospect"}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={save} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Med Spa Name *</label>
                  <input required type="text" value={form.business_name} onChange={e => setForm({...form, business_name: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Radiance Med Spa" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Website</label>
                  <input type="text" value={form.website} onChange={e => setForm({...form, website: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="radiancemedspa.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="info@medspa.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="(555) 000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">City</label>
                  <input type="text" value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Los Angeles" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">State</label>
                  <input type="text" value={form.state} onChange={e => setForm({...form, state: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="CA" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Booking Platform</label>
                  <select value={form.booking_platform} onChange={e => setForm({...form, booking_platform: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">— Select —</option>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Services Summary</label>
                  <textarea value={form.services_summary} onChange={e => setForm({...form, services_summary: e.target.value})}
                    rows={2} className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Botox, fillers, laser, facials..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pricing Notes</label>
                  <textarea value={form.pricing_notes} onChange={e => setForm({...form, pricing_notes: e.target.value})}
                    rows={2} className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Botox from $12/unit..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Assigned Demo Number</label>
                  <input type="text" value={form.assigned_demo_number} onChange={e => setForm({...form, assigned_demo_number: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="+1 (555) 000-0000" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Internal Notes</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                    rows={2} className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="High call volume, no online booking..." />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Prospect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
