"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    target_regions: "California, New York",
    target_platforms: "Acuity, Boulevard, Mindbody",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/outreach-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          target_regions: form.target_regions.split(",").map((s) => s.trim()).filter(Boolean),
          target_platforms: form.target_platforms.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        setSaving(false);
        return;
      }
      if (!data.campaign?.id) {
        setError("Campaign created but response was malformed — check the campaigns list");
        setSaving(false);
        return;
      }
      // Redirect to list (not detail) — avoids race where the new campaign isn't
      // yet visible to the detail endpoint's follow-up read. User clicks in from the list.
      router.push("/admin/outreach");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Link href="/admin/outreach" className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 mb-3">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All campaigns
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">New Outreach Campaign</h1>
      <p className="text-sm text-gray-500 mb-6">Define who to target. The research agent will use these to find matching med spas.</p>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Campaign Name *
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="LA Boulevard Spas — Q2 2026"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Description (optional)
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="High-volume med spas using Boulevard in LA county"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Target Regions (comma-separated)
          </label>
          <input
            type="text"
            value={form.target_regions}
            onChange={(e) => setForm({ ...form, target_regions: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="California, New York"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Target Platforms (comma-separated)
          </label>
          <input
            type="text"
            value={form.target_platforms}
            onChange={(e) => setForm({ ...form, target_platforms: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Acuity, Boulevard, Mindbody"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Link
            href="/admin/outreach"
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}
