"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulingSettings {
  booking_forward_enabled: boolean;
  booking_forward_phones: string[];
  booking_forward_sms_template: string;
}

interface IntegrationState {
  platform: string | null;
  mode: "direct_book" | "hybrid" | "sms_fallback" | null;
  status: "pending" | "connected" | "error" | "disabled";
  connected_at: string | null;
  last_error: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  boulevard: "Boulevard",
  acuity: "Acuity Scheduling",
  mindbody: "Mindbody",
  square: "Square Appointments",
  zenoti: "Zenoti",
  vagaro: "Vagaro",
  jane: "Jane",
  glossgenius: "GlossGenius",
  fresha: "Fresha",
  self_managed: "Self-managed calendar",
};

interface ForwardedRequest {
  id: string;
  customer_name: string;
  customer_phone: string;
  service: string;
  preferred_date: string | null;
  preferred_time: string | null;
  notes: string | null;
  backup_slots: string | null;
  time_preference: string | null;
  provider_preference: string | null;
  provider_flexibility: string | null;
  status: string;
  forwarded_to: string[];
  forward_sent_at: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_TOKENS = [
  { token: "[CustomerName]", label: "Patient Name" },
  { token: "[CustomerPhone]", label: "Patient Phone" },
  { token: "[Service]", label: "Service" },
  { token: "[DateTime]", label: "Date & Time" },
  { token: "[ProviderPreference]", label: "Provider Pref." },
  { token: "[ProviderFlexibility]", label: "Provider Flex." },
  { token: "[BackupSlots]", label: "Backup Slots" },
  { token: "[TimePreference]", label: "Time Preference" },
  { token: "[Notes]", label: "Notes" },
  { token: "[ClinicName]", label: "Clinic Name" },
];

const SAMPLE_VALUES: Record<string, string> = {
  "[CustomerName]": "Sarah Johnson",
  "[CustomerPhone]": "+1 (310) 555-0192",
  "[Service]": "Botox — 20 Units",
  "[DateTime]": "Friday Apr 19 at 2:00 PM",
  "[ProviderPreference]": "Dr. Sarah",
  "[ProviderFlexibility]": "Open to Dr. Mia as a second choice",
  "[BackupSlots]": "Also Thursday mornings or any Friday",
  "[TimePreference]": "Afternoons preferred",
  "[Notes]": "First-time patient, referred by Mia",
  "[ClinicName]": "Glow Med Spa",
};

function renderPreview(template: string): string {
  let out = template;
  for (const [token, value] of Object.entries(SAMPLE_VALUES)) {
    out = out.split(token).join(value);
  }
  return out;
}

function formatDateTime(date: string | null, time: string | null): string {
  if (!date && !time) return "Flexible";
  if (date && time) return `${date} at ${time}`;
  return date || time || "Flexible";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulingSystemPage() {
  // Scheduling settings
  const [settings, setSettings] = useState<SchedulingSettings>({
    booking_forward_enabled: false,
    booking_forward_phones: [],
    booking_forward_sms_template: "",
  });
  const [newPhone, setNewPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Forwarded requests
  const [requests, setRequests] = useState<ForwardedRequest[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Booking platform integration (admin-managed, tenant-visible)
  const [integration, setIntegration] = useState<IntegrationState | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchAll = useCallback(async () => {
    const [settingsRes, requestsRes, integrationRes] = await Promise.all([
      fetch("/api/settings/scheduling"),
      fetch("/api/bookings/forwarded"),
      fetch("/api/integrations/me"),
    ]);

    if (integrationRes.ok) {
      const data = await integrationRes.json();
      setIntegration(data);
    }

    if (settingsRes.ok) {
      const data = await settingsRes.json();
      setSettings(data);
    }
    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setRequests(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    // Force booking_forward_enabled based on integration mode — the toggle is gone;
    // hybrid & sms_fallback modes require forwarding to be on, direct_book doesn't use it.
    const forwardEnabled =
      integration?.mode === "hybrid" || integration?.mode === "sms_fallback";
    const payload = { ...settings, booking_forward_enabled: forwardEnabled };
    const res = await fetch("/api/settings/scheduling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setSettings((s) => ({ ...s, booking_forward_enabled: forwardEnabled }));
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function addPhone() {
    const raw = newPhone.trim();
    if (!raw) return;
    // Basic E.164 / US friendly validation
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) {
      setPhoneError("Enter a valid phone number with area code.");
      return;
    }
    const formatted = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    if (settings.booking_forward_phones.includes(formatted)) {
      setPhoneError("This number is already in the list.");
      return;
    }
    setPhoneError("");
    setSettings((s) => ({ ...s, booking_forward_phones: [...s.booking_forward_phones, formatted] }));
    setNewPhone("");
  }

  function removePhone(phone: string) {
    setSettings((s) => ({ ...s, booking_forward_phones: s.booking_forward_phones.filter((p) => p !== phone) }));
  }

  function insertToken(token: string) {
    setSettings((s) => ({ ...s, booking_forward_sms_template: s.booking_forward_sms_template + token }));
  }

  if (loading) {
    return <div className="p-10 text-center text-gray-400 font-medium italic animate-pulse">Loading scheduling engine...</div>;
  }

  return (
    <div className="max-w-3xl space-y-10">
      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Scheduling Engine</h1>
        <p className="text-sm text-gray-500 font-medium mt-1">
          Configure how your AI receptionist handles appointment requests.
        </p>
      </div>

      {/* ── Booking platform integration status ── */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          Booking Platform Integration
        </p>

        {!integration || integration.status === "pending" || !integration.platform ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                Pending setup
              </span>
              <span className="text-sm text-gray-500">No booking platform connected yet.</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Now supporting Boulevard, Acuity, Mindbody, Square, Zenoti, Vagaro, Jane, and WellnessLiving. Contact us to integrate yours.
            </p>
            <a
              href="mailto:founder@vauxvoice.com?subject=Booking%20platform%20integration"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-colors"
            >
              Email us at founder@vauxvoice.com
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        ) : integration.status === "error" ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                Connection error
              </span>
              <span className="text-sm text-gray-700 font-semibold">
                {integration.platform ? PLATFORM_LABELS[integration.platform] ?? integration.platform : "Platform"}
              </span>
            </div>
            {integration.last_error && (
              <p className="text-xs text-red-600 mb-3">{integration.last_error}</p>
            )}
            <p className="text-sm text-gray-600">
              Something went wrong with your integration. Our team has been notified — or reach us at{" "}
              <a href="mailto:founder@vauxvoice.com" className="text-indigo-600 font-semibold">
                founder@vauxvoice.com
              </a>.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                Connected
              </span>
              <span className="text-sm text-gray-800 font-semibold">
                {PLATFORM_LABELS[integration.platform] ?? integration.platform}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">
                {integration.mode === "direct_book"
                  ? "Direct booking"
                  : integration.mode === "hybrid"
                  ? "Verify + SMS confirm"
                  : "SMS to staff"}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {integration.mode === "direct_book" &&
                "Your AI can check real-time availability and write bookings directly into " +
                  (PLATFORM_LABELS[integration.platform] ?? "your platform") +
                  ". No manual confirmation needed."}
              {integration.mode === "hybrid" &&
                "Your AI confirms availability against your platform, then sends booking requests to your team via SMS for final lock-in."}
              {integration.mode === "sms_fallback" &&
                "Your AI collects booking details and sends them to your team via SMS. Your team confirms in your calendar."}
            </p>
          </div>
        )}
      </div>

      {/* ── Staff Notification Forwarding (required for hybrid & sms_fallback) ── */}
      {(integration?.mode === "hybrid" || integration?.mode === "sms_fallback") && (
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Section header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Staff Notification Forwarding</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-lg">
                {integration.mode === "hybrid"
                  ? "Your AI verifies availability against your booking platform, then texts your team with the booking request to lock in."
                  : "Your AI captures booking details and texts your team so they can confirm directly in your booking system."}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider flex-shrink-0">
              Required
            </span>
          </div>

          {settings.booking_forward_phones.length === 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-900">Add at least one staff number below</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Without a notification number, booking requests from callers will be lost.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-8 space-y-8">

            {/* ── Staff phone numbers ── */}
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Notify These Numbers</p>

              <div className="space-y-2 mb-3">
                {settings.booking_forward_phones.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No numbers added yet. Add at least one to receive notifications.</p>
                )}
                {settings.booking_forward_phones.map((phone) => (
                  <div key={phone} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📱</span>
                      <span className="text-sm font-mono font-bold text-gray-800">{phone}</span>
                    </div>
                    <button
                      onClick={() => removePhone(phone)}
                      className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                      aria-label="Remove number"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Add number input */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => { setNewPhone(e.target.value); setPhoneError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && addPhone()}
                    placeholder="+1 (555) 000-0000"
                    className={`w-full px-4 py-3 rounded-2xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      phoneError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
                    }`}
                  />
                  {phoneError && <p className="text-xs text-red-500 mt-1 ml-1">{phoneError}</p>}
                </div>
                <button
                  onClick={addPhone}
                  className="px-5 py-3 bg-indigo-600 text-white text-sm font-black uppercase tracking-wider rounded-2xl hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 ml-1">Standard carrier messaging rates apply. Numbers must be US/Canada format.</p>
            </div>

            {/* ── SMS Template ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Staff SMS Template</p>
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {showPreview ? "Edit Template" : "Preview SMS"}
                </button>
              </div>

              {showPreview ? (
                /* SMS preview bubble */
                <div className="bg-gray-100 rounded-3xl p-6">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sample — how staff will see it</p>
                  <div className="flex justify-end">
                    <div className="bg-indigo-600 text-white rounded-3xl rounded-tr-sm px-5 py-4 max-w-xs">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderPreview(settings.booking_forward_sms_template)}</p>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-gray-400 mt-4 font-medium">
                    Sample values shown — real data is filled in at call time.
                  </p>
                </div>
              ) : (
                <>
                  <textarea
                    value={settings.booking_forward_sms_template}
                    onChange={(e) => setSettings((s) => ({ ...s, booking_forward_sms_template: e.target.value }))}
                    rows={8}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />

                  {/* Token chips */}
                  <div className="mt-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Insert Token</p>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_TOKENS.map(({ token, label }) => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── How it works callout ── */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 flex gap-4">
              <span className="text-2xl flex-shrink-0">💡</span>
              <div>
                <p className="text-sm font-black text-indigo-800">How it works</p>
                <ol className="text-sm text-indigo-700 mt-1 space-y-1 list-decimal list-inside">
                  <li>Caller asks to book an appointment</li>
                  <li>AI conversationally collects name, phone, service, and preferred time</li>
                  <li>AI tells caller your team will reach out to confirm</li>
                  <li>Staff above receive an instant SMS with all the details</li>
                  <li>Staff confirm directly with the patient via call or text</li>
                </ol>
              </div>
            </div>
          </div>

        {/* Save button */}
        <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium">
            Changes take effect on the next incoming call.
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-gray-900 text-white hover:bg-gray-700"
            } disabled:opacity-50`}
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
      )}
      {/* ── Forwarded Requests Log ── */}
      {requests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Recent Forwarded Requests
            </p>
            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider">
              {requests.length} total
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {requests.map((req) => (
              <div key={req.id}>
                <button
                  className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Status dot */}
                      <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900 truncate">{req.customer_name}</p>
                        <p className="text-xs text-gray-500 font-medium truncate">
                          {req.service} · {formatDateTime(req.preferred_date, req.preferred_time)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400 font-medium">{timeAgo(req.forward_sent_at)}</span>
                      <span className="text-gray-300">{expandedId === req.id ? "▲" : "▼"}</span>
                    </div>
                  </div>
                </button>

                {expandedId === req.id && (
                  <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-5 text-sm">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Patient</p>
                        <p className="font-bold text-gray-800 mt-0.5">{req.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Phone</p>
                        <a href={`tel:${req.customer_phone}`} className="font-bold text-indigo-600 mt-0.5 hover:underline block">
                          {req.customer_phone}
                        </a>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Service</p>
                        <p className="font-bold text-gray-800 mt-0.5">{req.service}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested Time</p>
                        <p className="font-bold text-gray-800 mt-0.5">{formatDateTime(req.preferred_date, req.preferred_time)}</p>
                      </div>

                      {/* Scheduling flexibility row */}
                      <div className="col-span-2 bg-white rounded-2xl border border-gray-200 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Provider Pref.</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.provider_preference || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Open to Others?</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.provider_flexibility || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Backup Slots</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.backup_slots || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Time Preference</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.time_preference || "—"}</p>
                        </div>
                      </div>

                      {req.notes && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes</p>
                          <p className="font-medium text-gray-600 mt-0.5">{req.notes}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff Notified</p>
                        <p className="font-medium text-gray-600 mt-0.5">{(req.forwarded_to ?? []).join(", ")}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for requests when forwarding is on but no requests yet */}
      {requests.length === 0 && settings.booking_forward_enabled && (
        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">📨</p>
          <p className="text-sm font-black text-gray-700 uppercase tracking-wide">No forwarded requests yet</p>
          <p className="text-sm text-gray-400 mt-1">
            When a caller requests an appointment, it'll show up here after your team is notified.
          </p>
        </div>
      )}
    </div>
  );
}
