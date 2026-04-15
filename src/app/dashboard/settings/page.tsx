"use client";

import { useState, useEffect } from "react";

interface TenantSettings {
  name: string;
  greeting_message: string;
  system_prompt_override: string;
  deposit_amount: number;
  booking_provider: "internal" | "vagaro" | "acuity" | "mindbody" | "link";
  booking_config: any;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>({
    name: "",
    greeting_message: "",
    system_prompt_override: "",
    deposit_amount: 0,
    booking_provider: "internal",
    booking_config: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="p-10 text-center text-gray-400 text-sm">Loading settings...</div>;

  return (
    <div className="max-w-3xl pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Clinic Settings</h1>
        <p className="text-sm text-gray-500">Configure your clinic identity and AI behavior.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Clinic Identity */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Clinic Identity
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Clinic Display Name
              </label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                AI Greeting Message
              </label>
              <textarea
                rows={3}
                value={settings.greeting_message}
                onChange={(e) => setSettings({ ...settings, greeting_message: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm resize-none"
                placeholder="Thank you for calling [Clinic]! I'm your AI receptionist. How can I help you today?"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">This is the first thing callers hear when they call your number.</p>
            </div>
          </div>
        </div>

        {/* AI Behavior */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Behavior
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 ml-6">Customize how your AI receptionist handles calls and what it prioritizes.</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Custom Instructions
              </label>
              <textarea
                rows={5}
                value={settings.system_prompt_override}
                onChange={(e) => setSettings({ ...settings, system_prompt_override: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm resize-none font-mono"
                placeholder={`e.g.\n- Always emphasize our free consultation offer\n- Upsell our monthly membership plan to new callers\n- Do not discuss competitor pricing`}
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                These instructions are added to your AI's core behavior. Use bullet points for best results.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Booking Deposit Amount
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  min={0}
                  value={settings.deposit_amount}
                  onChange={(e) => setSettings({ ...settings, deposit_amount: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Amount collected when a booking is confirmed via Stripe. Set to 0 to disable deposits.</p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end items-center gap-4 pt-1">
          {saved && (
            <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Settings saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
