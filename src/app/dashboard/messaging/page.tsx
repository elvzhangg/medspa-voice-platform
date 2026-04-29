"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Toggle from "../_components/Toggle";
import { SMS_TEMPLATES } from "@/lib/sms/templates";

interface SMSSettings {
  sms_confirmation_enabled: boolean;
  sms_reminders_enabled: boolean;
  sms_reminder_hours: number;
  sms_followup_enabled: boolean;
  sms_followup_hours: number;
  sms_checkin_enabled: boolean;
  integration_platform: string | null;
  integration_mode: string | null;
}

// Platforms that send their own confirmation/reminder SMS natively. When the
// tenant is connected to one of these, we steer them away from duplicating
// those messages and emphasize aftercare (which most platforms don't cover).
const PLATFORMS_WITH_NATIVE_SMS: Record<string, string> = {
  boulevard: "Boulevard",
  mindbody: "Mindbody",
  square: "Square",
  vagaro: "Vagaro",
  acuity: "Acuity Scheduling",
  jane: "Jane",
  zenoti: "Zenoti",
  wellnessliving: "WellnessLiving",
};

function SectionCard({
  title,
  description,
  enabled,
  onToggle,
  children,
  badge,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${enabled ? "border-amber-200 shadow-sm shadow-amber-50" : "border-zinc-200"}`}>
      <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-zinc-900 text-sm">{title}</h2>
            {badge}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
        <Toggle enabled={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="p-6 space-y-5 animate-in fade-in duration-200">
          {children}
        </div>
      )}
      {!enabled && (
        <div className="px-6 py-3 bg-zinc-50/50">
          <p className="text-xs text-zinc-400 italic">Enable to configure options.</p>
        </div>
      )}
    </div>
  );
}

function MessagePreview({ template }: { template: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        Message preview
      </label>
      <div className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
        {template}
      </div>
      <p className="text-[11px] text-zinc-400 mt-1.5">
        We use a fixed, vetted message to keep your texts compliant with HIPAA and SMS regulations.
        Tokens like <code className="bg-zinc-100 px-1 rounded">{"{Customer}"}</code> and{" "}
        <code className="bg-zinc-100 px-1 rounded">{"{Clinic}"}</code> are filled in automatically.
      </p>
    </div>
  );
}

export default function MessagingPage() {
  // The dashboard's file route is /dashboard/... — middleware rewrites
  // /[slug]/dashboard/... onto it, but useParams() can only see file-route
  // segments so it returns no tenant. Read the slug straight off the URL
  // path instead (it's always the first segment).
  const pathname = usePathname() ?? "";
  const slug = pathname.split("/").filter(Boolean)[0] ?? "";
  const [settings, setSettings] = useState<SMSSettings>({
    sms_confirmation_enabled: true,
    sms_reminders_enabled: false,
    sms_reminder_hours: 24,
    sms_followup_enabled: false,
    sms_followup_hours: 24,
    sms_checkin_enabled: false,
    integration_platform: null,
    integration_mode: null,
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
      body: JSON.stringify({
        sms_confirmation_enabled: settings.sms_confirmation_enabled,
        sms_reminders_enabled: settings.sms_reminders_enabled,
        sms_reminder_hours: settings.sms_reminder_hours,
        sms_followup_enabled: settings.sms_followup_enabled,
        sms_followup_hours: settings.sms_followup_hours,
        sms_checkin_enabled: settings.sms_checkin_enabled,
      }),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  function set(patch: Partial<SMSSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  if (loading) return <div className="p-10 text-zinc-400 text-sm">Loading messaging settings...</div>;

  const platformKey = settings.integration_platform?.toLowerCase() || "";
  const platformName = PLATFORMS_WITH_NATIVE_SMS[platformKey];
  const platformSendsNativeSms =
    Boolean(platformName) && settings.integration_mode === "direct_book";

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-zinc-900 mb-1">Messaging & SMS</h1>
        <p className="text-sm text-zinc-500">
          Automated texts sent to clients before and after their appointments.
        </p>
      </div>

      {platformSendsNativeSms && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm text-amber-900 font-semibold mb-1">
            You're connected to {platformName}
          </p>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            {platformName} sends its own appointment confirmations and reminders. To avoid
            double-texting your clients, we recommend keeping ours off and turning on{" "}
            <span className="font-semibold">Post-Visit Aftercare</span> — that's the part {platformName}{" "}
            doesn't cover.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Instant Booking Confirmations */}
        <SectionCard
          title="Instant Booking Confirmations"
          description="Send a text immediately after an appointment is booked."
          enabled={settings.sms_confirmation_enabled}
          onToggle={() => set({ sms_confirmation_enabled: !settings.sms_confirmation_enabled })}
          badge={
            platformSendsNativeSms ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-semibold">
                {platformName} sends this
              </span>
            ) : null
          }
        >
          <MessagePreview template={SMS_TEMPLATES.confirmation} />
        </SectionCard>

        {/* Appointment Reminders */}
        <SectionCard
          title="Appointment Reminders"
          description="Send an automatic reminder before a scheduled appointment."
          enabled={settings.sms_reminders_enabled}
          onToggle={() => set({ sms_reminders_enabled: !settings.sms_reminders_enabled })}
          badge={
            platformSendsNativeSms ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-semibold">
                {platformName} sends this
              </span>
            ) : null
          }
        >
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Send reminder
            </label>
            <select
              value={settings.sms_reminder_hours}
              onChange={(e) => set({ sms_reminder_hours: parseInt(e.target.value) })}
              className="px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-50 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            >
              <option value={2}>2 hours before</option>
              <option value={12}>12 hours before</option>
              <option value={24}>24 hours before</option>
              <option value={48}>48 hours before</option>
            </select>
          </div>
          <MessagePreview template={SMS_TEMPLATES.reminder} />
        </SectionCard>

        {/* Post-Visit Aftercare Follow-Up */}
        <SectionCard
          title="Post-Visit Aftercare"
          description="Send treatment-specific aftercare instructions after the appointment."
          enabled={settings.sms_followup_enabled}
          onToggle={() => set({ sms_followup_enabled: !settings.sms_followup_enabled })}
          badge={
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
              VauxVoice exclusive
            </span>
          }
        >
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Send aftercare
            </label>
            <select
              value={settings.sms_followup_hours}
              onChange={(e) => set({ sms_followup_hours: parseInt(e.target.value) })}
              className="px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-50 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            >
              <option value={2}>2 hours after appointment</option>
              <option value={24}>24 hours after appointment</option>
              <option value={48}>48 hours after appointment</option>
            </select>
          </div>
          <MessagePreview template={SMS_TEMPLATES.followupWrapper} />
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 flex items-start justify-between gap-4">
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-semibold">Author guidelines per treatment.</span> The{" "}
              <code className="bg-white/60 px-1 rounded">{"{Guideline}"}</code> in the message is the
              aftercare body you write for each service (e.g., Botox, microneedling). Without these,
              we won't send.
            </div>
            <Link
              href={`/${slug}/dashboard/messaging/post-procedure`}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 transition-colors"
            >
              Manage guidelines →
            </Link>
          </div>
        </SectionCard>

        {/* Week-Later Check-In (optional add-on) */}
        <SectionCard
          title="Week-Later Check-In"
          description="A short, generic wellness check sent 1 week after the appointment."
          enabled={settings.sms_checkin_enabled}
          onToggle={() => set({ sms_checkin_enabled: !settings.sms_checkin_enabled })}
          badge={
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold">
              Add-on
            </span>
          }
        >
          <MessagePreview template={SMS_TEMPLATES.checkInWeek} />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Separate from clinical aftercare — this is a relationship touchpoint, not treatment
            information. It intentionally doesn't name the procedure or include any medical
            guidance, keeping PHI exposure to a minimum.
          </p>
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
