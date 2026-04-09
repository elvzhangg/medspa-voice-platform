"use client";

import { useState, useEffect } from "react";

interface TenantSettings {
  name: string;
  greeting_message: string;
  system_prompt_override: string;
  deposit_amount: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>({
    name: "",
    greeting_message: "",
    system_prompt_override: "",
    deposit_amount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      const res = await fetch("/api/settings");
      if (res.ok) {
        setSettings(await res.json());
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (res.ok) {
      setMessage("Settings saved successfully! The AI will use these changes on the next call.");
    } else {
      setMessage("Failed to save settings. Please try again.");
    }
    setSaving(false);
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Clinic Settings</h1>
        <p className="text-sm text-gray-500 text-sm">Configure how your AI receptionist represents your business.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6 space-y-4">
            {/* Clinic Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Clinic Display Name</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="e.g. Glow Med Spa"
              />
            </div>

            {/* Greeting */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">AI Greeting Message</label>
              <textarea
                value={settings.greeting_message}
                onChange={(e) => setSettings({ ...settings, greeting_message: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all h-24"
                placeholder="How the AI answers the phone..."
              />
              <p className="mt-1 text-xs text-gray-400">The first thing the customer hears when the AI picks up.</p>
            </div>

            {/* Prompt Override */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Custom AI Instructions</label>
              <textarea
                value={settings.system_prompt_override || ""}
                onChange={(e) => setSettings({ ...settings, system_prompt_override: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all h-32"
                placeholder="e.g. Always mention our current special on HydraFacials..."
              />
              <p className="mt-1 text-xs text-gray-400">Give the AI specific personality or strategy instructions unique to your clinic.</p>
            </div>

            {/* Deposit */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Default Booking Deposit ($)</label>
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-2 text-gray-400">$</span>
                <input
                  type="number"
                  value={settings.deposit_amount || 0}
                  onChange={(e) => setSettings({ ...settings, deposit_amount: parseInt(e.target.value) })}
                  className="w-full pl-7 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">If set to more than 0, the AI will offer to text a payment link for this amount to secure the booking.</p>
            </div>
          </div>

          <div className="p-6 bg-gray-50 flex justify-between items-center border-t border-gray-100">
            {message && <p className={`text-sm font-medium ${message.includes("failed") ? "text-red-600" : "text-emerald-600"}`}>{message}</p>}
            <button
              type="submit"
              disabled={saving}
              className="ml-auto px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-100"
            >
              {saving ? "Saving Changes..." : "Update AI Receptionist"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
