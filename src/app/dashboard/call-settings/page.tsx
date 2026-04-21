"use client";

import { useState, useEffect } from "react";
import Toggle from "../_components/Toggle";

interface CallSettings {
  greeting_message: string;
  system_prompt_override: string;
  ai_voice_id: string;
  call_recording_enabled: boolean;
  voicemail_forwarding_number: string;
}

export default function CallSettingsPage() {
  const [settings, setSettings] = useState<CallSettings>({
    greeting_message: "",
    system_prompt_override: "",
    ai_voice_id: "rachel",
    call_recording_enabled: true,
    voicemail_forwarding_number: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      const res = await fetch("/api/settings/calls");
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
    await fetch("/api/settings/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setMessage("AI Call settings updated!");
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  }

  if (loading) return <div className="p-10 text-gray-400 text-center">Loading call settings...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">AI Receptionist Config</h1>
        <p className="text-sm text-gray-500">Configure how your medical spa AI interacts with callers.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8 pb-20">
        {/* Core Behavior */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              AI Personality & Voice
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Greeting Message</label>
              <textarea 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl h-24 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={settings.greeting_message}
                onChange={e => setSettings({...settings, greeting_message: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Voice Identity</label>
                <select 
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={settings.ai_voice_id}
                  onChange={e => setSettings({...settings, ai_voice_id: e.target.value})}
                >
                  <option value="rachel">Rachel (Professional/Waitress)</option>
                  <option value="drew">Dr. Drew (Medical/Direct)</option>
                  <option value="natasha">Natasha (Warm/Engaging)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Record all calls</label>
                <div className="flex items-center gap-3 mt-2">
                  <Toggle
                    enabled={settings.call_recording_enabled}
                    onChange={() => setSettings({ ...settings, call_recording_enabled: !settings.call_recording_enabled })}
                    ariaLabel="Record all calls"
                  />
                  <span className="text-xs font-bold text-gray-500">{settings.call_recording_enabled ? "ON" : "OFF"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Human Agent Transfer */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Live Transfer & Human Handoff
            </h2>
            <p className="text-xs text-gray-500 mt-1 ml-7">When a caller requests to speak with a live team member, the AI will seamlessly transfer them to this number.</p>
          </div>
          <div className="p-6">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Transfer-to Number</label>
            <input
              placeholder="+1 (555) 000-0000"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              value={settings.voicemail_forwarding_number}
              onChange={e => setSettings({...settings, voicemail_forwarding_number: e.target.value})}
            />
            <p className="mt-2 text-xs text-gray-400">Leave blank to disable live transfers.</p>
          </div>
        </div>

        <div className="flex justify-end gap-4 items-center">
          {message && <p className="text-sm font-bold text-emerald-600">{message}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all uppercase tracking-widest text-xs"
          >
            {saving ? "Syncing..." : "Update AI Brain"}
          </button>
        </div>
      </form>
    </div>
  );
}
