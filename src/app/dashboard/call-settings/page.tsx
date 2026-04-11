"use client";

import { useState, useEffect } from "react";

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
              AI Personality \u0026 Voice
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
                  <button
                    type="button"
                    onClick={() => setSettings({...settings, call_recording_enabled: !settings.call_recording_enabled})}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.call_recording_enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.call_recording_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs font-bold text-gray-500">{settings.call_recording_enabled ? "ON" : "OFF"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety \u0026 Transfers */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm border-amber-100">
          <div className="p-6 border-b border-gray-100 bg-amber-50/50">
            <h2 className="font-bold text-amber-900 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Fail-safes \u0026 Transfers
            </h2>
          </div>
          <div className="p-6">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Human Forwarding Number</label>
            <input 
              placeholder="+1 (555) 000-0000" 
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
              value={settings.voicemail_forwarding_number}
              onChange={e => setSettings({...settings, voicemail_forwarding_number: e.target.value})}
            />
            <p className="mt-2 text-[10px] text-amber-600 font-bold">If the AI can&apos;t answer a medical question, it will offer to transfer to this number.</p>
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
