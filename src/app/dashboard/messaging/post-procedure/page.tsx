"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Template {
  id: string;
  service_name: string;
  guideline_text: string;
  active: boolean;
  updated_at: string;
}

interface ApiResponse {
  templates: Template[];
  seen_services: string[];
}

export default function PostProcedurePage() {
  const params = useParams();
  const slug = (params?.tenant as string) || "";
  const [templates, setTemplates] = useState<Template[]>([]);
  const [seenServices, setSeenServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ service_name: string; guideline_text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/post-procedure-templates");
    if (res.ok) {
      const data: ApiResponse = await res.json();
      setTemplates(data.templates);
      setSeenServices(data.seen_services);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const coveredNames = useMemo(
    () => new Set(templates.map((t) => t.service_name.toLowerCase())),
    [templates]
  );
  const uncoveredServices = seenServices.filter((s) => !coveredNames.has(s.toLowerCase()));

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch("/api/settings/post-procedure-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(null);
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this guideline? Aftercare SMS will stop sending for this service.")) return;
    await fetch(`/api/settings/post-procedure-templates?id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) {
    return <div className="p-10 text-zinc-400 text-sm">Loading guidelines...</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/${slug}/dashboard/messaging`}
          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← Messaging & SMS
        </Link>
        <h1 className="font-serif text-3xl text-zinc-900 mt-2 mb-1">Post-Procedure Guidelines</h1>
        <p className="text-sm text-zinc-500">
          Write the aftercare instructions clients receive by text after each treatment. We pick the
          right guideline based on the service on their appointment.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <p className="text-xs text-amber-900 leading-relaxed">
          <span className="font-semibold">Write as you'd hand it to a client.</span> Don't include
          their name or personal details — the SMS wrapper handles that. Keep it short, plain
          language, and avoid medical advice that should come from a provider.
        </p>
      </div>

      {uncoveredServices.length > 0 && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
            Services without guidelines yet
          </p>
          <p className="text-xs text-zinc-500 mb-3">
            These services appear on your bookings but have no aftercare SMS configured. Tap to add
            one.
          </p>
          <div className="flex flex-wrap gap-2">
            {uncoveredServices.map((s) => (
              <button
                key={s}
                onClick={() => setEditing({ service_name: s, guideline_text: "" })}
                className="px-3 py-1.5 text-xs rounded-full border border-zinc-300 bg-white hover:border-amber-400 hover:bg-amber-50 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.length === 0 && uncoveredServices.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-10 text-center">
            <p className="text-sm text-zinc-500">No services or guidelines yet.</p>
            <button
              onClick={() => setEditing({ service_name: "", guideline_text: "" })}
              className="mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-zinc-300 hover:border-amber-400 transition-colors"
            >
              Add a guideline manually
            </button>
          </div>
        )}

        {templates.map((t) => (
          <div
            key={t.id}
            className="bg-white rounded-xl border border-zinc-200 overflow-hidden"
          >
            <div className="px-5 py-3 flex items-center justify-between border-b border-zinc-100">
              <h3 className="text-sm font-semibold text-zinc-900">{t.service_name}</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setEditing({ service_name: t.service_name, guideline_text: t.guideline_text })
                  }
                  className="text-xs text-zinc-600 hover:text-zinc-900 underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="px-5 py-3 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
              {t.guideline_text}
            </div>
          </div>
        ))}
      </div>

      {templates.length > 0 && (
        <button
          onClick={() => setEditing({ service_name: "", guideline_text: "" })}
          className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-zinc-300 hover:border-amber-400 transition-colors"
        >
          + Add another guideline
        </button>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100">
              <h3 className="font-semibold text-zinc-900">
                {editing.service_name ? `Aftercare for ${editing.service_name}` : "New guideline"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Service name
                </label>
                <input
                  type="text"
                  value={editing.service_name}
                  onChange={(e) => setEditing({ ...editing, service_name: e.target.value })}
                  placeholder="e.g. Botox, Microneedling, HydraFacial"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Must match the service name on appointments (case-insensitive).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Aftercare instructions
                </label>
                <textarea
                  rows={8}
                  value={editing.guideline_text}
                  onChange={(e) => setEditing({ ...editing, guideline_text: e.target.value })}
                  placeholder="Avoid alcohol for 24 hours. Don't lie down for 4 hours. Skip workouts today..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-zinc-50/60 border-t border-zinc-100 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-zinc-300 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editing.service_name.trim() || !editing.guideline_text.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-400 text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save guideline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
