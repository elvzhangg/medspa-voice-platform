"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  target_regions: string[] | null;
  target_platforms: string[] | null;
  created_at: string;
  outreach_prospects: { count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-500",
};

export default function OutreachPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", target_regions: "California, New York", target_platforms: "Acuity, Boulevard, Mindbody" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/outreach-campaigns", { cache: "no-store" });
    const json = await res.json();
    setCampaigns(json.campaigns ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/outreach-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        target_regions: form.target_regions.split(",").map(s => s.trim()).filter(Boolean),
        target_platforms: form.target_platforms.split(",").map(s => s.trim()).filter(Boolean),
      }),
    });
    setShowNew(false);
    setForm({ name: "", description: "", target_regions: "California, New York", target_platforms: "Acuity, Boulevard, Mindbody" });
    setSaving(false);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outreach Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Target med spas, assign demo numbers, track outreach.</p>
        </div>
        <Link
          href="/admin/outreach/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Legacy new-campaign modal kept for backward compat, but the button now routes to /admin/outreach/new */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">New Outreach Campaign</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={createCampaign} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Campaign Name</label>
                <input
                  type="text" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="CA/NY Demo Blitz — Q2 2026"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="High-volume med spas using scheduling platforms..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Target Regions (comma-separated)</label>
                <input
                  type="text" value={form.target_regions}
                  onChange={e => setForm({ ...form, target_regions: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Target Platforms (comma-separated)</label>
                <input
                  type="text" value={form.target_platforms}
                  onChange={e => setForm({ ...form, target_platforms: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No campaigns yet</p>
          <p className="text-xs text-gray-400">Create your first outreach campaign to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const count = c.outreach_prospects?.[0]?.count ?? 0;
            return (
              <Link
                key={c.id}
                href={`/admin/outreach/${c.id}`}
                className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between hover:border-indigo-200 hover:shadow-sm transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{c.name}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </div>
                  {c.description && <p className="text-sm text-gray-500 truncate mb-2">{c.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {c.target_regions && c.target_regions.length > 0 && (
                      <span>{c.target_regions.join(", ")}</span>
                    )}
                    {c.target_platforms && c.target_platforms.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-gray-300 rounded-full" />
                        {c.target_platforms.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-6">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-400">prospects</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
