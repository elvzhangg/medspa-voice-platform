"use client";

import { useEffect, useState, useCallback } from"react";
import { useDismiss } from"../_components/useDismiss";

interface Client {
 id: string;
 phone: string;
 first_name: string | null;
 last_name: string | null;
 email: string | null;
 total_calls: number;
 total_bookings: number;
 last_call_at: string | null;
 last_booking_at: string | null;
 last_service: string | null;
 last_provider: string | null;
 preferred_provider: string | null;
 preferred_time: string | null;
 referral_source: string | null;
 tags: string[];
 staff_notes: string | null;
 no_personalization: boolean;
}

interface AuditRow {
 field: string;
 old_value: string | null;
 new_value: string | null;
 source: string;
 source_detail: string | null;
 created_at: string;
}

function displayName(c: Client) {
 const name = [c.first_name, c.last_name].filter(Boolean).join("").trim();
 return name || c.phone;
}

function fmtDate(iso: string | null) {
 if (!iso) return"—";
 return new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

export default function ClientsPage() {
 const [clients, setClients] = useState<Client[]>([]);
 const [loading, setLoading] = useState(true);
 const [selected, setSelected] = useState<Client | null>(null);
 const [search, setSearch] = useState("");

 const refresh = useCallback(async () => {
 const res = await fetch("/api/clients");
 if (res.ok) {
 const data = await res.json();
 setClients(data.clients || []);
 }
 setLoading(false);
 }, []);

 useEffect(() => {
 refresh();
 }, [refresh]);

 const filtered = clients.filter((c) => {
 if (!search.trim()) return true;
 const q = search.toLowerCase();
 return (
 (c.first_name ||"").toLowerCase().includes(q) ||
 (c.last_name ||"").toLowerCase().includes(q) ||
 (c.phone ||"").toLowerCase().includes(q) ||
 (c.email ||"").toLowerCase().includes(q)
 );
 });

 return (
 <div>
 <div className="mb-8 flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-semibold text-gray-900 mb-1">Clients</h1>
 <p className="text-sm text-gray-500">
 Everyone who's called your AI receptionist, plus what we remember about them.
 </p>
 </div>
 <input
 type="search"
 placeholder="Search name, phone, email…"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-72 px-3.5 py-2 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
 />
 </div>

 {loading ? (
 <div className="flex items-center justify-center py-24">
 <div className="w-5 h-5 border-2 border-stone-700 border-t-transparent rounded-full animate-spin" />
 </div>
 ) : filtered.length === 0 ? (
 <div className="bg-white rounded-xl border border-gray-200 text-center py-20">
 <h3 className="text-base font-semibold text-gray-700 mb-1">
 {clients.length === 0 ?"No clients yet" :"No matches"}
 </h3>
 <p className="text-sm text-gray-400">
 {clients.length === 0
 ?"Client profiles are created automatically when callers reach your AI."
 :"Try a different search term."}
 </p>
 </div>
 ) : (
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full text-sm">
 <thead className="border-b border-gray-100">
 <tr className="bg-gray-50">
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Name</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Phone</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Calls</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Bookings</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Last Service</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Last Call</th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Tags</th>
 </tr>
 </thead>
 <tbody>
 {filtered.map((c) => (
 <tr
 key={c.id}
 className="border-b border-gray-50 hover:bg-amber-50/40 cursor-pointer transition-colors"
 onClick={() => setSelected(c)}
 >
 <td className="px-5 py-3.5 font-medium text-gray-900">{displayName(c)}</td>
 <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.phone}</td>
 <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.total_calls}</td>
 <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.total_bookings}</td>
 <td className="px-5 py-3.5 text-gray-500">{c.last_service ||"—"}</td>
 <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmtDate(c.last_call_at)}</td>
 <td className="px-5 py-3.5">
 <div className="flex gap-1 flex-wrap">
 {(c.tags || []).slice(0, 3).map((t) => (
 <span
 key={t}
 className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[11px] rounded-full"
 >
 {t}
 </span>
 ))}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {selected && (
 <ClientDrawer
 clientId={selected.id}
 onClose={() => setSelected(null)}
 onSaved={() => {
 refresh();
 }}
 />
 )}
 </div>
 );
}

interface BriefData {
 brief: string;
 cold_start: boolean;
 source_call_ids: string[];
 generated_at: string;
}

function ClientDrawer({
 clientId,
 onClose,
 onSaved,
}: {
 clientId: string;
 onClose: () => void;
 onSaved: () => void;
}) {
 const [profile, setProfile] = useState<Client | null>(null);
 const [audit, setAudit] = useState<AuditRow[]>([]);
 const [saving, setSaving] = useState(false);
 const [form, setForm] = useState<Partial<Client>>({});
 const [tagsInput, setTagsInput] = useState("");
 const [brief, setBrief] = useState<BriefData | null>(null);
 const [briefLoading, setBriefLoading] = useState(true);

 useDismiss(true, onClose);

 useEffect(() => {
 let mounted = true;
 (async () => {
 const res = await fetch(`/api/clients/${clientId}`);
 if (res.ok && mounted) {
 const data = await res.json();
 setProfile(data.profile);
 setAudit(data.updates || []);
 setForm(data.profile);
 setTagsInput((data.profile.tags || []).join(","));
 }
 })();

 // Load brief in parallel — it's slower (~1-2s LLM hop), don't block
 // the drawer from opening.
 setBriefLoading(true);
 setBrief(null);
 (async () => {
 const res = await fetch(`/api/clients/${clientId}/brief`);
 if (res.ok && mounted) {
 setBrief(await res.json());
 }
 if (mounted) setBriefLoading(false);
 })();

 return () => {
 mounted = false;
 };
 }, [clientId]);

 async function save() {
 setSaving(true);
 const tags = tagsInput
 .split(",")
 .map((t) => t.trim())
 .filter(Boolean);
 const res = await fetch(`/api/clients/${clientId}`, {
 method:"PATCH",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify({ ...form, tags }),
 });
 setSaving(false);
 if (res.ok) {
 onSaved();
 onClose();
 }
 }

 return (
 <div className="fixed inset-0 z-30 flex">
 <div className="flex-1 bg-black/30" onClick={onClose} />
 <div className="w-[520px] bg-white shadow-2xl overflow-y-auto">
 {!profile ? (
 <div className="flex items-center justify-center h-full">
 <div className="w-5 h-5 border-2 border-stone-700 border-t-transparent rounded-full animate-spin" />
 </div>
 ) : (
 <div className="p-6 space-y-6">
 <div className="flex items-start justify-between">
 <div>
 <h2 className="text-xl font-bold text-gray-900">{displayName(profile)}</h2>
 <p className="text-sm text-gray-500 tabular-nums">{profile.phone}</p>
 </div>
 <button
 onClick={onClose}
 className="text-gray-400 hover:text-gray-600 p-1"
 aria-label="Close"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="grid grid-cols-3 gap-3">
 <Stat label="Calls" value={profile.total_calls} />
 <Stat label="Bookings" value={profile.total_bookings} />
 <Stat
 label="Last call"
 value={profile.last_call_at ? fmtDate(profile.last_call_at) :"—"}
 />
 </div>

 <section className="bg-gradient-to-br from-amber-50 to-amber-50 border border-amber-200 rounded-xl p-4">
 <div className="flex items-center gap-2 mb-2">
 <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
 </svg>
 <h3 className="text-xs font-semibold text-amber-800">
 Before you see them
 </h3>
 {brief && !brief.cold_start && brief.source_call_ids.length > 0 && (
 <span className="ml-auto text-[10px] text-amber-500 font-medium">
 from {brief.source_call_ids.length} past call
 {brief.source_call_ids.length === 1 ?"" :"s"}
 </span>
 )}
 </div>
 {briefLoading ? (
 <div className="flex items-center gap-2 py-2">
 <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
 <span className="text-xs text-amber-500 italic">Reading their history…</span>
 </div>
 ) : brief ? (
 <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
 {brief.brief}
 </p>
 ) : (
 <p className="text-xs text-gray-400 italic">Couldn&apos;t load brief.</p>
 )}
 </section>

 <section className="space-y-3">
 <h3 className="text-xs font-medium text-gray-500">Identity</h3>
 <div className="grid grid-cols-2 gap-3">
 <Field label="First name" value={form.first_name ??""} onChange={(v) => setForm({ ...form, first_name: v })} />
 <Field label="Last name" value={form.last_name ??""} onChange={(v) => setForm({ ...form, last_name: v })} />
 </div>
 <Field label="Email" value={form.email ??""} onChange={(v) => setForm({ ...form, email: v })} />
 </section>

 <section className="space-y-3">
 <h3 className="text-xs font-medium text-gray-500">Preferences</h3>
 <Field
 label="Preferred provider"
 value={form.preferred_provider ??""}
 onChange={(v) => setForm({ ...form, preferred_provider: v })}
 />
 <Field
 label="Preferred time"
 value={form.preferred_time ??""}
 onChange={(v) => setForm({ ...form, preferred_time: v })}
 />
 <Field
 label="Referral source"
 value={form.referral_source ??""}
 onChange={(v) => setForm({ ...form, referral_source: v })}
 />
 </section>

 <section className="space-y-3">
 <h3 className="text-xs font-medium text-gray-500">Staff Notes & Tags</h3>
 <div>
 <label className="text-[11px] text-gray-500 mb-1 block">Notes (visible to AI)</label>
 <textarea
 value={form.staff_notes ??""}
 onChange={(e) => setForm({ ...form, staff_notes: e.target.value })}
 rows={3}
 className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none resize-none"
 placeholder="e.g. allergic to lidocaine, prefers texts over calls…"
 />
 </div>
 <div>
 <label className="text-[11px] text-gray-500 mb-1 block">Tags (comma-separated)</label>
 <input
 value={tagsInput}
 onChange={(e) => setTagsInput(e.target.value)}
 className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
 placeholder="VIP, new patient, Botox regular"
 />
 </div>
 <label className="flex items-center gap-2 text-sm text-gray-700">
 <input
 type="checkbox"
 checked={form.no_personalization ?? false}
 onChange={(e) => setForm({ ...form, no_personalization: e.target.checked })}
 />
 Don't personalize greeting (treat as anonymous)
 </label>
 </section>

 <section className="space-y-2">
 <h3 className="text-xs font-medium text-gray-500">Audit Log</h3>
 {audit.length === 0 ? (
 <p className="text-sm text-gray-400">No changes recorded yet.</p>
 ) : (
 <ul className="space-y-1.5 max-h-52 overflow-y-auto">
 {audit.map((u, i) => (
 <li key={i} className="text-xs text-gray-600 border-l-2 border-amber-200 pl-3 py-0.5">
 <span className="font-semibold text-gray-700">{u.field}</span>:{""}
 <span className="text-gray-400 line-through">{u.old_value ||"∅"}</span> →{""}
 <span className="text-gray-800">{u.new_value ||"∅"}</span>
 <div className="text-[10px] text-gray-400 mt-0.5">
 {u.source} · {new Date(u.created_at).toLocaleString()}
 </div>
 </li>
 ))}
 </ul>
 )}
 </section>

 <div className="flex gap-2 pt-2">
 <button
 onClick={save}
 disabled={saving}
 className="flex-1 px-4 py-2.5 bg-stone-700 hover:bg-stone-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
 >
 {saving ?"Saving…" :"Save changes"}
 </button>
 <button
 onClick={onClose}
 className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg"
 >
 Cancel
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}

function Stat({ label, value }: { label: string; value: string | number }) {
 return (
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs font-medium text-gray-500">{label}</p>
 <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
 </div>
 );
}

function Field({
 label,
 value,
 onChange,
}: {
 label: string;
 value: string;
 onChange: (v: string) => void;
}) {
 return (
 <div>
 <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
 <input
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
 />
 </div>
 );
}
