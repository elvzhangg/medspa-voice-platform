"use client";

import { useState, useEffect } from "react";

interface SMSSettings {
  sms_reminders_enabled: boolean;
  sms_reminder_hours: number;
  sms_reminder_template: string;
  sms_confirmation_enabled: boolean;
}

export default function MessagingPage() {
  const [settings, setSettings] = useState<SMSSettings>({
    sms_reminders_enabled: false,
    sms_reminder_hours: 24,
    sms_reminder_template: "",
    sms_confirmation_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      const res = await fetch("/api/settings/messaging");
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
    await fetch("/api/settings/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setMessage("Settings saved successfully!");
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  }

  if (loading) return <div className="p-10 text-gray-400">Loading messaging settings...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Messaging & SMS</h1>
        <p className="text-sm text-gray-500">Configure automated appointment reminders and customer communication.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Instant Booking Confirmations */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-gray-900">Instant Booking Confirmations</h2>
              <p className="text-xs text-gray-500">Send a text immediately after an appointment is booked.</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({...settings, sms_confirmation_enabled: !settings.sms_confirmation_enabled})}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.sms_confirmation_enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.sms_confirmation_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="p-6 bg-gray-50/50">
            <p className="text-xs text-gray-600 italic">"Hi [Customer]! Your appointment at [Clinic] is confirmed for [Date] at [Time]..."</p>
          </div>
        </div>

        {/* Automated Appointment Reminders */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

          {settings.sms_reminders_enabled && (
            <div className="p-6 space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-4">
                <label className="text-sm font-bold text-gray-700">Send reminder</label>
                <select 
                  value={settings.sms_reminder_hours}
                  onChange={(e) => setSettings({...settings, sms_reminder_hours: parseInt(e.target.value)})}
                  className="px-3 py-1.5 border rounded-lg bg-gray-50 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={2}>2 hours before</option>
                  <option value={24}>24 hours before</option>
                  <option value={48}>48 hours before</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Automated Template (Standard):</p>
                  <p className="text-xs text-gray-600 italic">"Reminder: You have an appointment at [MedSpa] tomorrow at [Time]. We look forward to seeing you!"</p>
                </div>
                
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Custom Reminder Footer</label>
                <textarea 
                  placeholder="e.g. Remember to avoid alcohol 24 hours before your injections..."
                  className="w-full px-4 py-3 border rounded-xl h-24 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={settings.sms_reminder_template}
                  onChange={e => setSettings({...settings, sms_reminder_template: e.target.value})}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4 items-center">
          {message && <p className="text-sm font-bold text-emerald-600">{message}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Messaging Preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}
