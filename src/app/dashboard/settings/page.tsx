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
      setMessage("Settings saved successfully!");
    } else {
      setMessage("Failed to save settings.");
    }
    setSaving(false);
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-4xl pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Clinic Settings</h1>
        <p className="text-sm text-gray-500">Configure your clinic identity, AI behavior, and booking system.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Core Identity */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-900">Clinic Identity</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Clinic Display Name</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">AI Greeting Message</label>
              <textarea
                value={settings.greeting_message}
                onChange={(e) => setSettings({ ...settings, greeting_message: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none h-24"
              />
            </div>
          </div>
        </div>

        {/* Booking System Configuration */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm border-indigo-100">
          <div className="p-6 border-b border-gray-100 bg-indigo-50">
            <h2 className="font-bold text-gray-900 text-indigo-900">Booking & Calendar Setup</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Which booking system do you use?</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: "internal", name: "Vaux Calendar", desc: "Use our built-in calendar" },
                  { id: "vagaro", name: "Vagaro", desc: "Direct API integration" },
                  { id: "acuity", name: "Acuity", desc: "Direct API integration" },
                  { id: "mindbody", name: "Mindbody", desc: "For large wellness clinics" },
                  { id: "link", name: "External Link", desc: "Calendly, etc. (Text only)" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, booking_provider: p.id as any })}
                    className={`p-4 text-left border rounded-xl transition-all ${
                      settings.booking_provider === p.id 
                      ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20" 
                      : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className={`font-bold ${settings.booking_provider === p.id ? "text-indigo-700" : "text-gray-900"}`}>{p.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Provider-Specific Config */}
            {settings.booking_provider === "vagaro" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <input 
                  placeholder="Merchant ID" 
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.merchantId || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, merchantId: e.target.value}})}
                />
                <input 
                  placeholder="API Key" 
                  type="password"
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.apiKey || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, apiKey: e.target.value}})}
                />
              </div>
            )}

            {settings.booking_provider === "acuity" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <input 
                  placeholder="User ID" 
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.userId || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, userId: e.target.value}})}
                />
                <input 
                  placeholder="API Key" 
                  type="password"
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.apiKey || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, apiKey: e.target.value}})}
                />
              </div>
            )}

            {settings.booking_provider === "mindbody" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <input 
                  placeholder="Site ID" 
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.siteId || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, siteId: e.target.value}})}
                />
                <input 
                  placeholder="API Key" 
                  type="password"
                  className="px-4 py-2 border rounded-lg"
                  value={settings.booking_config.apiKey || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, apiKey: e.target.value}})}
                />
              </div>
            )}

            {settings.booking_provider === "link" && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <input 
                  placeholder="Paste your booking URL (e.g. calendly.com/...)" 
                  className="w-full px-4 py-2 border rounded-lg"
                  value={settings.booking_config.bookingUrl || ""}
                  onChange={e => setSettings({...settings, booking_config: {...settings.booking_config, bookingUrl: e.target.value}})}
                />
                <p className="text-[10px] text-gray-400 mt-2">The AI will text this link to the caller to finish their booking.</p>
              </div>
            )}

            {settings.booking_provider === "internal" && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                <p className="text-sm text-emerald-800 font-medium">All appointments will be managed through your built-in Vaux Calendar.</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end gap-4 items-center">
           {message && <p className="text-sm font-bold text-emerald-600 font-medium">{message}</p>}
           <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save All Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}
