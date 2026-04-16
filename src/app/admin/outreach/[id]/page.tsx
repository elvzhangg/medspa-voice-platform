"use client";

import { useState, useEffect, use } from "react";

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
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  target_regions: string[] | null;
  target_platforms: string[] | null;
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

  const filtered = filter === "all" ? prospects : prospects.filter(p => p.status === filter);
  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = prospects.filter(p => p.status === s).length;
    return acc;
  }, {} as Record<string, number>);

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
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add Prospect
        </button>
      </div>

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
          <p className="text-xs text-gray-400">Add med spas you want to target for this campaign.</p>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Demo #</th>
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
                  <td className="px-4 py-3.5 text-xs font-mono text-gray-600">
                    {p.assigned_demo_number || <span className="text-gray-300">—</span>}
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
                    placeholder="California" />
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
                    placeholder="Botox from $12/unit, packages from $499..." />
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
