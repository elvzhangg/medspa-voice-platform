"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface CallLog {
  id: string;
  vapi_call_id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  transcript: string | null;
  created_at: string;
}

interface Prospect {
  id: string;
  business_name: string;
  tenant_id: string | null;
}

interface Tenant {
  id: string;
  name: string;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
}

function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function CallsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    const res = await fetch(`/api/admin/crm/${id}/calls`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setProspect(data.prospect);
    setTenant(data.tenant);
    setCalls(data.calls);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Refresh every 30s in case a call comes in while we're watching.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle(callId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) next.delete(callId);
      else next.add(callId);
      return next;
    });
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (error || !prospect) return <p className="text-sm text-red-500">{error ?? "Not found"}</p>;

  const totalSec = calls.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
  const uniqueCallers = new Set(calls.map((c) => c.caller_number).filter(Boolean)).size;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/admin/crm" className="hover:text-gray-600">CRM</Link>
          <span>›</span>
          <Link href={`/admin/crm/${id}`} className="hover:text-gray-600">{prospect.business_name}</Link>
          <span>›</span>
          <span className="text-gray-600">Calls</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Calls to {prospect.business_name}</h1>
        {tenant?.phone_number && (
          <p className="text-sm text-gray-500 mt-1">
            Demo number: <span className="font-mono text-gray-800">{tenant.phone_number}</span>
            {tenant.phone_number.startsWith("pending:") && (
              <span className="ml-2 text-amber-600 text-xs">(not yet provisioned)</span>
            )}
          </p>
        )}
      </div>

      {!prospect.tenant_id && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Prospect not yet activated — no tenant or demo number assigned.{" "}
          <Link href={`/admin/crm/${id}/activate`} className="underline font-semibold">Activate now</Link>
        </div>
      )}

      {prospect.tenant_id && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total calls" value={calls.length.toString()} />
          <Stat label="Unique callers" value={uniqueCallers.toString()} />
          <Stat label="Total time" value={fmtDuration(totalSec)} />
        </div>
      )}

      {prospect.tenant_id && calls.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No calls yet.</p>
          <p className="text-xs text-gray-400 mt-1">This page auto-refreshes every 30s.</p>
        </div>
      )}

      {calls.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {calls.map((call) => {
            const isOpen = expanded.has(call.id);
            return (
              <div key={call.id} className="border-b border-gray-100 last:border-0">
                <div className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-gray-800">{call.caller_number ?? "(blocked)"}</span>
                      <span className="text-xs text-gray-400">{fmtDate(call.created_at)}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{fmtDuration(call.duration_seconds)}</span>
                    </div>
                    {call.summary && (
                      <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{call.summary}</p>
                    )}
                  </div>
                  {call.transcript && (
                    <button
                      onClick={() => toggle(call.id)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
                    >
                      {isOpen ? "Hide transcript" : "Show transcript"}
                    </button>
                  )}
                </div>
                {isOpen && call.transcript && (
                  <div className="px-4 pb-4">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded p-3 max-h-96 overflow-y-auto">
                      {call.transcript}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
