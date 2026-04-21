"use client";

import { useState, useEffect, useCallback } from"react";

interface StaffMember {
 id: string;
 name: string;
 title: string | null;
 services: string[] | null;
 specialties: string[] | null;
 ai_notes: string | null;
 working_hours: Record<string, { open: string; close: string }> | null;
 active: boolean;
 external_source: string | null;
 external_id: string | null;
 last_synced_at: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
 boulevard:"Boulevard",
 acuity:"Acuity",
 mindbody:"Mindbody",
 square:"Square",
 zenoti:"Zenoti",
 vagaro:"Vagaro",
 jane:"Jane",
 wellnessliving:"WellnessLiving",
};

export default function ProvidersPage() {
 const [staff, setStaff] = useState<StaffMember[]>([]);
 const [loading, setLoading] = useState(true);
 const [isAdding, setIsAdding] = useState(false);
 const [newStaff, setNewStaff] = useState({
 name:"",
 title:"",
 servicesString:"",
 specialtiesString:"",
 ai_notes:"",
 });

 const fetchStaff = useCallback(async () => {
 const res = await fetch("/api/staff");
 if (res.ok) {
 const data = await res.json();
 setStaff(data.staff ?? []);
 }
 setLoading(false);
 }, []);

 useEffect(() => {
 fetchStaff();
 }, [fetchStaff]);

 async function handleAddStaff(e: React.FormEvent) {
 e.preventDefault();
 const res = await fetch("/api/staff", {
 method:"POST",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify({
 name: newStaff.name,
 title: newStaff.title || null,
 services: newStaff.servicesString.split(",").map((s) => s.trim()).filter(Boolean),
 specialties: newStaff.specialtiesString.split(",").map((s) => s.trim()).filter(Boolean),
 ai_notes: newStaff.ai_notes || null,
 }),
 });
 if (res.ok) {
 setIsAdding(false);
 setNewStaff({ name:"", title:"", servicesString:"", specialtiesString:"", ai_notes:"" });
 fetchStaff();
 }
 }

 async function handleDelete(id: string) {
 if (!confirm("Remove this provider?")) return;
 const res = await fetch(`/api/staff/${id}`, { method:"DELETE" });
 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 alert(data.error ||"Failed to delete");
 return;
 }
 fetchStaff();
 }

 async function handlePatch(id: string, fields: Partial<StaffMember>) {
 const res = await fetch(`/api/staff/${id}`, {
 method:"PATCH",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify(fields),
 });
 if (res.ok) fetchStaff();
 }

 return (
 <div className="max-w-6xl">
 <div className="flex justify-between items-center mb-8">
 <div>
 <h1 className="text-2xl font-semibold text-gray-900">Providers</h1>
 <p className="text-sm text-gray-500">
 Your AI reads these notes aloud when callers ask about providers or need a recommendation.
 </p>
 </div>
 <button
 onClick={() => setIsAdding(true)}
 className="px-4 py-2 bg-zinc-950 text-white font-bold rounded-lg hover:bg-zinc-900 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
 >
 <span>+</span> Add Provider
 </button>
 </div>

 {isAdding && (
 <div className="mb-8 bg-white p-6 rounded-xl border-2 border-amber-200 shadow-sm">
 <h2 className="text-lg font-bold mb-4">New Provider</h2>
 <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <input
 placeholder="Full Name"
 className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
 value={newStaff.name}
 onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
 required
 />
 <input
 placeholder="Title (e.g. Nurse Injector)"
 className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
 value={newStaff.title}
 onChange={(e) => setNewStaff({ ...newStaff, title: e.target.value })}
 />
 <input
 placeholder="Services (comma-separated)"
 className="px-4 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2"
 value={newStaff.servicesString}
 onChange={(e) => setNewStaff({ ...newStaff, servicesString: e.target.value })}
 />
 <input
 placeholder="Specialties (comma-separated, e.g. Botox, anxious clients)"
 className="px-4 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2"
 value={newStaff.specialtiesString}
 onChange={(e) => setNewStaff({ ...newStaff, specialtiesString: e.target.value })}
 />
 <textarea
 placeholder="AI notes — what should the AI say about this provider? e.g. 'Sarah is our most experienced Botox injector and is great with first-timers.'"
 className="px-4 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2 h-24 resize-none"
 value={newStaff.ai_notes}
 onChange={(e) => setNewStaff({ ...newStaff, ai_notes: e.target.value })}
 />
 <div className="md:col-span-2 flex justify-end gap-2">
 <button
 type="button"
 onClick={() => setIsAdding(false)}
 className="px-4 py-2 text-gray-500 text-sm"
 >
 Cancel
 </button>
 <button type="submit" className="px-6 py-2 bg-zinc-950 text-white rounded-lg font-bold text-sm">
 Save Provider
 </button>
 </div>
 </form>
 </div>
 )}

 {loading ? (
 <p className="text-gray-400">Loading providers…</p>
 ) : staff.length === 0 ? (
 <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
 <p className="text-sm font-bold text-gray-700">No providers yet</p>
 <p className="text-xs text-gray-500 mt-1">
 Add a provider to give the AI someone to recommend. If your clinic is connected to a booking platform, your roster will sync automatically.
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {staff.map((member) => (
 <ProviderCard
 key={member.id}
 member={member}
 onPatch={handlePatch}
 onDelete={handleDelete}
 />
 ))}
 </div>
 )}
 </div>
 );
}

function ProviderCard({
 member,
 onPatch,
 onDelete,
}: {
 member: StaffMember;
 onPatch: (id: string, fields: Partial<StaffMember>) => Promise<void>;
 onDelete: (id: string) => void;
}) {
 const isSynced = Boolean(member.external_source);
 const platformLabel = isSynced ? PLATFORM_LABELS[member.external_source!] ?? member.external_source : null;

 const [aiNotes, setAiNotes] = useState(member.ai_notes ??"");
 const [specialtiesString, setSpecialtiesString] = useState((member.specialties ?? []).join(","));
 const [savingNotes, setSavingNotes] = useState(false);
 const [notesSaved, setNotesSaved] = useState(false);

 async function saveEnrichment() {
 setSavingNotes(true);
 setNotesSaved(false);
 await onPatch(member.id, {
 ai_notes: aiNotes || null,
 specialties: specialtiesString
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean),
 });
 setSavingNotes(false);
 setNotesSaved(true);
 setTimeout(() => setNotesSaved(false), 2000);
 }

 return (
 <div
 className={`bg-white rounded-2xl border p-6 transition-all ${
 member.active ?"border-gray-200" :"border-gray-100 opacity-60"
 }`}
 >
 <div className="flex items-start gap-4 mb-4">
 <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-lg shrink-0">
 {member.name.charAt(0)}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold text-gray-900">{member.name}</h3>
 {isSynced && (
 <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-full tracking-wide">
 Synced from {platformLabel}
 </span>
 )}
 {!member.active && (
 <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full tracking-wide">
 Inactive
 </span>
 )}
 </div>
 {member.title && <p className="text-sm text-amber-700 font-medium">{member.title}</p>}
 {member.services && member.services.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-2">
 {member.services.map((s) => (
 <span
 key={s}
 className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold tracking-wider"
 >
 {s}
 </span>
 ))}
 </div>
 )}
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <button
 onClick={() => onPatch(member.id, { active: !member.active })}
 className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
 >
 {member.active ?"Deactivate" :"Activate"}
 </button>
 {!isSynced && (
 <button
 onClick={() => onDelete(member.id)}
 className="text-gray-300 hover:text-red-500 transition-colors"
 aria-label="Delete"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
 />
 </svg>
 </button>
 )}
 </div>
 </div>

 <div className="space-y-3 pl-16">
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">
 Specialties (what callers should match them to)
 </label>
 <input
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
 placeholder="e.g. Botox, Juvederm, anxious clients"
 value={specialtiesString}
 onChange={(e) => setSpecialtiesString(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">
 AI notes
 </label>
 <textarea
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm h-20 resize-none"
 placeholder="What should the AI say about this provider? e.g. 'Sarah is our most experienced Botox injector and is great with first-timers.'"
 value={aiNotes}
 onChange={(e) => setAiNotes(e.target.value)}
 />
 </div>
 <div className="flex items-center justify-between">
 <p className="text-[11px] text-gray-400">
 {isSynced
 ?"Name, title, and services are synced from your booking platform and can't be edited here."
 :"Tenant-managed provider."}
 </p>
 <button
 onClick={saveEnrichment}
 disabled={savingNotes}
 className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 disabled:opacity-50"
 >
 {savingNotes ?"Saving…" : notesSaved ?"Saved" :"Save"}
 </button>
 </div>
 </div>
 </div>
 );
}
