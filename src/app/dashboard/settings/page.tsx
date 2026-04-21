"use client";

import { useState, useEffect, useCallback } from "react";
import Toggle from "../_components/Toggle";

interface IdentitySettings {
  name: string;
  greeting_message: string;
  system_prompt_override: string;
  deposit_amount: number;
  directions_parking_info: string;
}

interface CallSettings {
  ai_voice_id: string;
  call_recording_enabled: boolean;
  voicemail_forwarding_number: string;
}

export default function VoiceConfigurationsPage() {
  const [identity, setIdentity] = useState<IdentitySettings>({
    name: "",
    greeting_message: "",
    system_prompt_override: "",
    deposit_amount: 0,
    directions_parking_info: "",
  });
  const [calls, setCalls] = useState<CallSettings>({
    ai_voice_id: "rachel",
    call_recording_enabled: true,
    voicemail_forwarding_number: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchAll = useCallback(async () => {
    const [iRes, cRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/settings/calls"),
    ]);
    if (iRes.ok) setIdentity(await iRes.json());
    if (cRes.ok) {
      const data = await cRes.json();
      setCalls({
        ai_voice_id: data.ai_voice_id ?? "rachel",
        call_recording_enabled: data.call_recording_enabled ?? true,
        voicemail_forwarding_number: data.voicemail_forwarding_number ?? "",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    // /api/settings owns the shared identity + prompt fields;
    // /api/settings/calls owns the call-runtime fields only.
    // No overlap after the de-dupe, so parallel writes are safe.
    await Promise.all([
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity),
      }),
      fetch("/api/settings/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calls),
      }),
    ]);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return <div className="p-10 text-center text-gray-400 text-sm">Loading voice configurations…</div>;
  }

  return (
    <div className="max-w-3xl pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Voice Configurations</h1>
        <p className="text-sm text-gray-500">
          Everything that shapes how your AI receptionist talks and handles calls — in one place.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Section
          title="Clinic Identity"
          subtitle="Who your AI says it represents."
          icon={
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        >
          <Field label="Clinic Display Name">
            <input
              type="text"
              value={identity.name}
              onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
            />
          </Field>
          <Field
            label="Directions & Parking"
            hint="What the AI reads back when callers ask where you are or where to park."
          >
            <textarea
              rows={3}
              value={identity.directions_parking_info}
              onChange={(e) => setIdentity({ ...identity, directions_parking_info: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm resize-none"
              placeholder="e.g. We're at 123 Main St, on the 2nd floor. Free parking in the lot behind the building."
            />
          </Field>
        </Section>

        <Section
          title="Voice & Personality"
          subtitle="How your AI sounds and what it prioritizes."
          icon={
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          }
        >
          <Field label="Voice">
            <select
              value={calls.ai_voice_id}
              onChange={(e) => setCalls({ ...calls, ai_voice_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
            >
              <option value="rachel">Rachel — Professional, warm</option>
              <option value="drew">Drew — Medical, direct</option>
              <option value="natasha">Natasha — Warm, engaging</option>
            </select>
          </Field>
          <Field
            label="Greeting Message"
            hint="The first thing callers hear when they call your number."
          >
            <textarea
              rows={3}
              value={identity.greeting_message}
              onChange={(e) => setIdentity({ ...identity, greeting_message: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm resize-none"
              placeholder="Thank you for calling [Clinic]! I'm your AI receptionist. How can I help you today?"
            />
          </Field>
          <Field
            label="Custom Instructions"
            hint="Added to your AI's core behavior. Use bullet points for best results."
          >
            <textarea
              rows={5}
              value={identity.system_prompt_override}
              onChange={(e) => setIdentity({ ...identity, system_prompt_override: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm resize-none font-mono"
              placeholder={`e.g.\n- Always emphasize our free consultation offer\n- Upsell our monthly membership plan to new callers\n- Do not discuss competitor pricing`}
            />
          </Field>
        </Section>

        <Section
          title="Call Handling"
          subtitle="What happens during and after a call."
          icon={
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
        >
          <Field label="Record all calls">
            <div className="flex items-center gap-3">
              <Toggle
                enabled={calls.call_recording_enabled}
                onChange={() =>
                  setCalls({ ...calls, call_recording_enabled: !calls.call_recording_enabled })
                }
                ariaLabel="Record all calls"
              />
              <span className="text-xs font-bold text-gray-500">
                {calls.call_recording_enabled ? "ON" : "OFF"}
              </span>
            </div>
          </Field>
          <Field
            label="Live Transfer Number"
            hint="When a caller asks to speak to a human, the AI transfers them here. Leave blank to disable."
          >
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={calls.voicemail_forwarding_number}
              onChange={(e) => setCalls({ ...calls, voicemail_forwarding_number: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
            />
          </Field>
        </Section>

        <Section
          title="Booking & Payments"
          subtitle="Rules the AI follows when securing an appointment."
          icon={
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
        >
          <Field
            label="Booking Deposit"
            hint="Collected via Stripe when a booking is confirmed. Set to 0 to disable deposits."
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 font-medium">$</span>
              <input
                type="number"
                min={0}
                value={identity.deposit_amount}
                onChange={(e) =>
                  setIdentity({ ...identity, deposit_amount: parseFloat(e.target.value) || 0 })
                }
                className="w-32 px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
              />
            </div>
          </Field>
        </Section>

        <div className="flex justify-end items-center gap-4 pt-1">
          {saved && (
            <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50 text-sm"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 ml-6">{subtitle}</p>}
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}
