"use client";

import { useState, useEffect } from "react";
import Toggle from "../_components/Toggle";

interface SMSSettings {
  sms_reminders_enabled: boolean;
  sms_reminder_hours: number;
  sms_reminder_template: string;
  sms_confirmation_enabled: boolean;
  sms_confirmation_message: string;
  sms_followup_enabled: boolean;
  sms_followup_hours: number;
  sms_followup_message: string;
}

function SectionCard({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${enabled ? "border-amber-200 shadow-sm shadow-amber-50" : "border-gray-200"}`}>
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Toggle enabled={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="p-6 space-y-5 animate-in fade-in duration-200">
          {children}
        </div>
      )}
      {!enabled && (
        <div className="px-6 py-3 bg-gray-50/50">
          <p className="text-xs text-gray-400 italic">Enable to configure options.</p>
        </div>
      )}
    </div>
  );
}

export default function MessagingPage() {
  const [settings, setSettings] = useState<SMSSettings>({
    sms_reminders_enabled: false,
    sms_reminder_hours: 24,
    sms_reminder_template: "",
    sms_confirmation_enabled: true,
    sms_confirmation_message: "Hi [Customer]! Your appointment at [Clinic] is confirmed for [Date] at [Time]. We look forward to seeing you!",
    sms_followup_enabled: false,
    sms_followup_hours: 24,
    sms_followup_message: "Hi [Customer], it was wonderful having you at [Clinic]! We hope you're loving your results. Don't hesitate to reach out if you have any questions — we'd love to see you again soon.",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      const res = await fetch("/api/settings/messaging");
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
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
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  function set(patch: Partial<SMSSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  if (loading) return <div className="p-10 text-gray-400 text-sm">Loading messaging settings...</div>;

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Messaging & SMS</h1>
        <p className="text-sm text-gray-500">
          Configure automated texts sent to clients before and after their appointments.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Instant Booking Confirmations */}
        <SectionCard
          title="Instant Booking Confirmations"
          description="Send a text immediately after an appointment is booked."
          enabled={settings.sms_confirmation_enabled}
          onToggle={() => set({ sms_confirmation_enabled: !settings.sms_confirmation_enabled })}
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Confirmation Message
            </label>
            <textarea
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none transition-all resize-none"
              value={settings.sms_confirmation_message}
              onChange={(e) => set({ sms_confirmation_message: e.target.value })}
              placeholder="Hi [Customer]! Your appointment at [Clinic] is confirmed for [Date] at [Time]..."
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Available tokens: <code className="bg-gray-100 px-1 rounded">[Customer]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Clinic]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Date]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Time]</code>
            </p>
          </div>
        </SectionCard>

        {/* Appointment Reminders */}
        <SectionCard
          title="Appointment Reminders"
          description="Send an automatic reminder before a scheduled appointment."
          enabled={settings.sms_reminders_enabled}
          onToggle={() => set({ sms_reminders_enabled: !settings.sms_reminders_enabled })}
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Send Reminder
            </label>
            <select
              value={settings.sms_reminder_hours}
              onChange={(e) => set({ sms_reminder_hours: parseInt(e.target.value) })}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            >
              <option value={2}>2 hours before</option>
              <option value={12}>12 hours before</option>
              <option value={24}>24 hours before</option>
              <option value={48}>48 hours before</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Custom Reminder Message
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Reminder: You have an appointment at [Clinic] on [Date] at [Time]. Please avoid alcohol 24 hours prior."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none transition-all resize-none"
              value={settings.sms_reminder_template}
              onChange={(e) => set({ sms_reminder_template: e.target.value })}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Available tokens: <code className="bg-gray-100 px-1 rounded">[Customer]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Clinic]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Date]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Time]</code>
            </p>
          </div>
        </SectionCard>

        {/* Post-Visit Follow-Up */}
        <SectionCard
          title="Post-Visit Follow-Up"
          description="Send a personalized message after a client's appointment to encourage rebooking."
          enabled={settings.sms_followup_enabled}
          onToggle={() => set({ sms_followup_enabled: !settings.sms_followup_enabled })}
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Send Follow-Up
            </label>
            <select
              value={settings.sms_followup_hours}
              onChange={(e) => set({ sms_followup_hours: parseInt(e.target.value) })}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            >
              <option value={2}>2 hours after appointment</option>
              <option value={24}>24 hours after appointment</option>
              <option value={48}>48 hours after appointment</option>
              <option value={168}>1 week after appointment</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Follow-Up Message
            </label>
            <textarea
              rows={4}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none transition-all resize-none"
              value={settings.sms_followup_message}
              onChange={(e) => set({ sms_followup_message: e.target.value })}
              placeholder="Hi [Customer], it was wonderful having you at [Clinic]! We hope you're loving your results..."
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Available tokens: <code className="bg-gray-100 px-1 rounded">[Customer]</code>{" "}
              <code className="bg-gray-100 px-1 rounded">[Clinic]</code>
            </p>
          </div>
        </SectionCard>

        <div className="flex justify-end items-center gap-4 pt-2">
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
            className="px-6 py-2.5 bg-white text-amber-900 border border-amber-400 shadow-sm font-semibold rounded-lg hover:bg-[#fdf9ec] hover:border-amber-500 shadow-sm transition-all disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : "Save Messaging Preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}
