"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const VOICE_OPTIONS = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah — Mature, Reassuring" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger — Laid-Back, Casual" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura — Enthusiast, Quirky" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George — Warm Storyteller" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice — Clear, Engaging" },
];

export default function OnboardPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    greeting_message: "Thank you for calling! How can I help you today?",
    initial_kb: "",
    area_code: "415",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const res = await fetch("/api/admin/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      router.push("/admin");
    } else {
      const data = await res.json();
      setError(data.error || "Failed to onboard");
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Onboard New Med Spa</h1>
      <p className="text-gray-500 mb-8">
        Create a new tenant, provision a phone number, and set up their AI Clientele Specialist.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Business Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Glow Med Spa"
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Area Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Preferred Area Code
          </label>
          <input
            type="text"
            value={form.area_code}
            onChange={(e) => setForm({ ...form, area_code: e.target.value })}
            placeholder="415"
            maxLength={3}
            className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">We&apos;ll try this area code first, fall back to available if not.</p>
        </div>

        {/* Voice */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
          <select
            value={form.voice_id}
            onChange={(e) => setForm({ ...form, voice_id: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Greeting Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Greeting Message</label>
          <input
            type="text"
            value={form.greeting_message}
            onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">What the AI says when it picks up the call.</p>
        </div>

        {/* Initial KB */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initial Knowledge Base Content
          </label>
          <textarea
            value={form.initial_kb}
            onChange={(e) => setForm({ ...form, initial_kb: e.target.value })}
            rows={8}
            placeholder="Paste services, pricing, policies, FAQs, etc. We'll process and embed this."
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={status === "loading"}
          className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "Creating..." : "Create Tenant & Provision Number"}
        </button>
      </form>
    </div>
  );
}
