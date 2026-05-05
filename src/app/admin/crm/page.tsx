"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Stage = "top_of_funnel" | "crm" | "rejected";

interface Prospect {
  id: string;
  business_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  booking_platform: string | null;
  research_confidence: number | null;
  researched_at: string | null;
  crm_stage: Stage;
  crm_promoted_at: string | null;
  created_at: string;
}

interface Facets {
  states: string[];
  platforms: string[];
}

interface ListResponse {
  prospects: Prospect[];
  facets: Facets;
  counts: Record<Stage, number>;
}

interface AgentLogEntry {
  id: number;
  type: string;
  step_type?: string;
  message?: string;
  text?: string;
  business_name?: string;
}

const TABS: { value: Stage; label: string }[] = [
  { value: "top_of_funnel", label: "Top of Funnel" },
  { value: "crm", label: "CRM" },
  { value: "rejected", label: "Rejected" },
];

const STEP_ICONS: Record<string, string> = {
  thinking: "💭",
  searching: "🔍",
  found: "✅",
  decision: "📝",
  summary: "📋",
};

const PLATFORM_OPTIONS = ["Acuity", "Boulevard", "Mindbody", "Other"];

const EMPTY_FORM = {
  business_name: "",
  website: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  booking_platform: "",
  services_summary: "",
  notes: "",
};

export default function CrmPage() {
  const [stage, setStage] = useState<Stage>("top_of_funnel");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [facets, setFacets] = useState<Facets>({ states: [], platforms: [] });
  const [counts, setCounts] = useState<Record<Stage, number>>({
    top_of_funnel: 0,
    crm: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");

  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>());

  // Agent state
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentDone, setAgentDone] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [agentRegions, setAgentRegions] = useState("California, New York");
  const [agentPlatforms, setAgentPlatforms] = useState("Acuity, Boulevard, Mindbody");
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  // Manual-add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCity(cityFilter), 250);
    return () => clearTimeout(t);
  }, [cityFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ stage });
    if (stateFilter) params.set("state", stateFilter);
    if (debouncedCity) params.set("city", debouncedCity);
    if (platformFilter) params.set("platform", platformFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);

    const res = await fetch(`/api/admin/crm?${params}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ListResponse;
      setProspects(data.prospects);
      setFacets(data.facets);
      setCounts(data.counts);
    }
    setSelected(new Set<string>());
    setLoading(false);
  }, [stage, stateFilter, debouncedCity, platformFilter, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs]);

  function changeStage(next: Stage) {
    if (next === stage) return;
    setStage(next);
    setStateFilter("");
    setCityFilter("");
    setPlatformFilter("");
    setSearch("");
    setSelected(new Set<string>());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === prospects.length
        ? new Set<string>()
        : new Set<string>(prospects.map((p) => p.id))
    );
  }

  async function bulkMove(target: Stage) {
    if (selected.size === 0) return;
    if (target === "rejected" && !confirm(`Reject ${selected.size} prospect(s)?`)) return;

    setActing(true);
    const res = await fetch("/api/admin/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), crm_stage: target }),
    });
    setActing(false);
    if (res.ok) {
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Failed to update prospects");
    }
  }

  function addLog(event: Omit<AgentLogEntry, "id">) {
    setAgentLogs((prev) => [...prev, { ...event, id: ++logIdRef.current }]);
  }

  async function runAgent() {
    setAgentRunning(true);
    setAgentDone(false);
    setAgentLogs([]);

    try {
      const res = await fetch("/api/admin/crm/agent/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_regions: agentRegions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          target_platforms: agentPlatforms
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
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

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAddError(null);
    const res = await fetch("/api/admin/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      if (data.deduped) {
        setAddError("That website is already in the CRM.");
        return;
      }
      setShowAdd(false);
      setForm(EMPTY_FORM);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setAddError(err.error ?? "Failed to add prospect");
    }
  }

  const selectedCount = selected.size;
  const allSelected = prospects.length > 0 && selectedCount === prospects.length;

  const headerSubtitle = useMemo(() => {
    if (stage === "top_of_funnel")
      return "Fresh leads from the research agent. Vet and promote into the CRM.";
    if (stage === "crm") return "Vetted prospects ready for outreach.";
    return "Dismissed leads — kept here in case you want to undo.";
  }, [stage]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-gray-500 mt-1 text-sm">{headerSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setAgentOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Research
          </button>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setAddError(null);
              setShowAdd(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Prospect
          </button>
        </div>
      </div>

      {/* Agent panel */}
      {agentOpen && (
        <div className="mb-6 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${
                agentRunning ? "bg-emerald-400 animate-pulse"
                  : agentDone ? "bg-blue-400" : "bg-slate-600"
              }`} />
              <span className="text-white font-semibold text-sm">CRM Research Agent</span>
              {agentRunning && <span className="text-xs text-slate-400">Running…</span>}
              {agentDone && !agentRunning && <span className="text-xs text-slate-400">Complete</span>}
            </div>
            <button
              onClick={() => setAgentOpen(false)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          {/* Targeting controls */}
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-slate-800">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Target Regions
              </label>
              <input
                type="text"
                value={agentRegions}
                onChange={(e) => setAgentRegions(e.target.value)}
                disabled={agentRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                placeholder="California, New York"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Target Platforms
              </label>
              <input
                type="text"
                value={agentPlatforms}
                onChange={(e) => setAgentPlatforms(e.target.value)}
                disabled={agentRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                placeholder="Acuity, Boulevard, Mindbody"
              />
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              New leads are saved to <strong className="text-slate-200">Top of Funnel</strong>{" "}
              for vetting. Existing leads are skipped automatically.
            </p>
            {!agentRunning && (
              <button
                onClick={runAgent}
                className="px-3.5 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
              >
                {agentDone ? "Run Again" : "Run Agent"}
              </button>
            )}
          </div>

          {/* Log stream */}
          {agentLogs.length > 0 && (
            <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-2 font-mono">
              {agentLogs.map((log) => {
                if (log.type === "step") {
                  const icon = STEP_ICONS[log.step_type ?? ""] ?? "▸";
                  const color =
                    log.step_type === "found" ? "text-emerald-400" :
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
                      <span>Saved to top-of-funnel: <strong>{log.business_name}</strong></span>
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
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {TABS.map((t) => {
          const active = stage === t.value;
          return (
            <button
              key={t.value}
              onClick={() => changeStage(t.value)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                active
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  active ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"
                }`}
              >
                {counts[t.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All states</option>
          {facets.states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder="City…"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All platforms</option>
          {facets.platforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, website, email…"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg flex-1 min-w-[220px] max-w-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {(stateFilter || cityFilter || platformFilter || search) && (
          <button
            onClick={() => {
              setStateFilter("");
              setCityFilter("");
              setPlatformFilter("");
              setSearch("");
            }}
            className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
          <span className="text-sm text-indigo-900 font-medium">{selectedCount} selected</span>
          <div className="flex-1" />
          {stage === "top_of_funnel" && (
            <>
              <button
                onClick={() => bulkMove("crm")}
                disabled={acting}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Add to CRM
              </button>
              <button
                onClick={() => bulkMove("rejected")}
                disabled={acting}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Reject
              </button>
            </>
          )}
          {stage === "crm" && (
            <button
              onClick={() => bulkMove("top_of_funnel")}
              disabled={acting}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Send back to Top of Funnel
            </button>
          )}
          {stage === "rejected" && (
            <>
              <button
                onClick={() => bulkMove("top_of_funnel")}
                disabled={acting}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Restore to Top of Funnel
              </button>
              <button
                onClick={() => bulkMove("crm")}
                disabled={acting}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Add directly to CRM
              </button>
            </>
          )}
          <button
            onClick={() => setSelected(new Set<string>())}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : prospects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">No prospects in this view</p>
          <p className="text-xs text-gray-400">
            {stage === "top_of_funnel"
              ? "Run the AI research agent or add a prospect manually."
              : "Try a different filter or tab."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Med Spa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospects.map((p) => {
                const isSelected = selected.has(p.id);
                const stamp = stage === "crm" && p.crm_promoted_at ? p.crm_promoted_at : p.created_at;
                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      isSelected ? "bg-indigo-50/40" : "hover:bg-gray-50/60"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(p.id)}
                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 block">{p.business_name}</span>
                      {p.website && (
                        <a
                          href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-500 hover:underline block max-w-[180px] truncate"
                        >
                          {p.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.booking_platform ? (
                        <span className="text-xs font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                          {p.booking_platform}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="text-indigo-500 hover:underline block truncate max-w-[180px]">
                          {p.email}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      {p.phone && <span className="text-gray-400 block">{p.phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.research_confidence != null ? (
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full ${
                            p.research_confidence >= 0.7
                              ? "bg-emerald-50 text-emerald-700"
                              : p.research_confidence >= 0.5
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          {Math.round(p.research_confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(stamp).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Manual-add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-900">Add Prospect to Top of Funnel</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitAdd} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Med Spa Name *</label>
                  <input
                    required type="text"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Radiance Med Spa"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Website</label>
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="radiancemedspa.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="info@medspa.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="CA"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Booking Platform</label>
                  <select
                    value={form.booking_platform}
                    onChange={(e) => setForm({ ...form, booking_platform: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">— Select —</option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Services Summary</label>
                  <textarea
                    value={form.services_summary}
                    onChange={(e) => setForm({ ...form, services_summary: e.target.value })}
                    rows={2}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Botox, fillers, laser, facials..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="High call volume, no online booking..."
                  />
                </div>
              </div>
              {addError && (
                <p className="text-red-500 text-xs">{addError}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add to Top of Funnel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
