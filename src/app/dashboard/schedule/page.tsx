"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulingSettings {
  booking_forward_enabled: boolean;
  booking_forward_phones: string[];
  booking_forward_sms_template: string;
}

interface TwilioStatus {
  connected: boolean;
  account_sid_masked: string | null;
  phone_number: string | null;
  auth_token_set: boolean;
  connected_at: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
}

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
  { token: "[BackupSlots]", label: "Backup Slots" },
  { token: "[TimePreference]", label: "Time Preference" },
  { token: "[ProviderPreference]", label: "Provider Pref." },
  { token: "[Notes]", label: "Notes" },
  { token: "[ClinicName]", label: "Clinic Name" },
];

const SAMPLE_VALUES: Record<string, string> = {
  "[CustomerName]": "Sarah Johnson",
  "[CustomerPhone]": "+1 (310) 555-0192",
  "[Service]": "Botox — 20 Units",
  "[DateTime]": "Friday Apr 19 at 2:00 PM",
  "[BackupSlots]": "Also Thursday mornings or any Friday",
  "[TimePreference]": "Afternoons preferred",
  "[ProviderPreference]": "Prefers Dr. Sarah",
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

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        enabled ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
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

  // Twilio connection
  const [twilio, setTwilio] = useState<TwilioStatus | null>(null);
  const [twilioForm, setTwilioForm] = useState({ account_sid: "", auth_token: "", phone_number: "" });
  const [twilioBusy, setTwilioBusy] = useState(false);
  const [twilioError, setTwilioError] = useState("");
  const [twilioMsg, setTwilioMsg] = useState("");
  const [showTwilioForm, setShowTwilioForm] = useState(false);
  const [testTarget, setTestTarget] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Carrier forward instructions
  const [carrier, setCarrier] = useState<"verizon" | "att" | "spectrum" | "ringcentral" | "other">("verizon");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchAll = useCallback(async () => {
    const [settingsRes, requestsRes, twilioRes] = await Promise.all([
      fetch("/api/settings/scheduling"),
      fetch("/api/bookings/forwarded"),
      fetch("/api/settings/twilio"),
    ]);

    if (settingsRes.ok) {
      const data = await settingsRes.json();
      setSettings(data);
    }
    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setRequests(data);
    }
    if (twilioRes.ok) {
      const data = await twilioRes.json();
      setTwilio(data);
      if (data.phone_number) setTestTarget(""); // leave test target empty; user chooses
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings/scheduling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
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

  // ── Twilio actions ──────────────────────────────────────────────────────────
  async function saveTwilio() {
    setTwilioBusy(true);
    setTwilioError("");
    setTwilioMsg("");
    const res = await fetch("/api/settings/twilio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(twilioForm),
    });
    const data = await res.json().catch(() => ({}));
    setTwilioBusy(false);
    if (!res.ok) {
      setTwilioError(data.error || "Failed to save Twilio credentials.");
      return;
    }
    setTwilioMsg("Connected! Your AI number is live.");
    setTwilioForm({ account_sid: "", auth_token: "", phone_number: "" });
    setShowTwilioForm(false);
    const refresh = await fetch("/api/settings/twilio");
    if (refresh.ok) setTwilio(await refresh.json());
  }

  async function disconnectTwilio() {
    if (!confirm("Disconnect your Twilio account? The staff SMS forward will stop working until you reconnect.")) return;
    setTwilioBusy(true);
    await fetch("/api/settings/twilio", { method: "DELETE" });
    setTwilioBusy(false);
    const refresh = await fetch("/api/settings/twilio");
    if (refresh.ok) setTwilio(await refresh.json());
    setTwilioMsg("Disconnected.");
  }

  async function sendTestSms() {
    setTestResult(null);
    if (!testTarget.trim()) {
      setTestResult({ ok: false, msg: "Enter a phone number to receive the test." });
      return;
    }
    const digits = testTarget.replace(/\D/g, "");
    const to = testTarget.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
    const res = await fetch("/api/settings/twilio/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setTestResult({ ok: true, msg: `Sent to ${to}. Check your phone.` });
    else setTestResult({ ok: false, msg: data.error || "Test failed." });
  }

  const CARRIER_STEPS: Record<typeof carrier, { label: string; steps: string[] }> = {
    verizon: {
      label: "Verizon (landline or wireless)",
      steps: [
        "From your business phone, dial **72, then your AI number (e.g. *72 4155550199), then press send/call.",
        "You'll hear two beeps confirming the forward is active.",
        "To turn off later, dial *73 from the same phone.",
      ],
    },
    att: {
      label: "AT&T",
      steps: [
        "From your business phone, dial **21*, then your AI number, then #. Press send/call.",
        "You'll hear a confirmation tone.",
        "To disable, dial ##21# from the same phone.",
      ],
    },
    spectrum: {
      label: "Spectrum / Charter",
      steps: [
        "Log in to your Spectrum Business account online.",
        "Go to Phone → Call Forwarding → 'Always'.",
        "Enter your AI number and save.",
      ],
    },
    ringcentral: {
      label: "RingCentral / VoIP",
      steps: [
        "Log in to the RingCentral admin portal.",
        "Settings → Call Handling → Call Forwarding.",
        "Choose 'Always forward' and enter your AI number. Save.",
      ],
    },
    other: {
      label: "Other carrier",
      steps: [
        "Look up 'unconditional call forwarding' in your provider's support docs.",
        "The dial code on most US carriers is *72 followed by the forward target.",
        "If you're on a VoIP system, the setting is usually under 'Call Handling' or 'Forwarding'.",
      ],
    },
  };

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

      {/* ── Onboarding: 3-step Twilio + Forwarding setup ── */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
          Your AI Phone Line — Setup
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ── Card 1: Connect Twilio ── */}
          <div className={`relative rounded-3xl border shadow-sm p-6 flex flex-col ${
            twilio?.connected ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-black">1</div>
              {twilio?.connected && (
                <span className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-full uppercase tracking-wider">Connected</span>
              )}
            </div>
            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Connect Twilio</h3>
            <p className="text-xs text-gray-500 font-medium mt-1 mb-4">
              Your Twilio number powers both the AI receptionist line and the staff SMS forward.
            </p>

            {twilio?.connected ? (
              <div className="mt-auto space-y-2">
                <div className="bg-white rounded-2xl px-3 py-2 border border-emerald-200">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Number</p>
                  <p className="text-sm font-mono font-bold text-gray-800">{twilio.phone_number}</p>
                </div>
                <p className="text-[10px] text-gray-500 font-medium">
                  SID: <span className="font-mono">{twilio.account_sid_masked}</span>
                </p>
                <button
                  onClick={disconnectTwilio}
                  disabled={twilioBusy}
                  className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors mt-2"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="mt-auto">
                <button
                  onClick={() => setShowTwilioForm((v) => !v)}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-indigo-700 transition-colors"
                >
                  {showTwilioForm ? "Cancel" : "Connect Twilio"}
                </button>
                <a
                  href="https://www.twilio.com/try-twilio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-[10px] font-bold text-indigo-600 hover:text-indigo-800 mt-2"
                >
                  Don&apos;t have Twilio? Sign up →
                </a>
              </div>
            )}
          </div>

          {/* ── Card 2: Forward your line ── */}
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-lg font-black">2</div>
              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-[10px] font-black rounded-full uppercase tracking-wider">1 min</span>
            </div>
            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Forward Your Line</h3>
            <p className="text-xs text-gray-500 font-medium mt-1 mb-4">
              Route your existing business number to the AI. Takes effect in seconds, reversible anytime.
            </p>

            <div className="mt-auto">
              <select
                value={carrier}
                onChange={(e) => setCarrier(e.target.value as typeof carrier)}
                className="w-full px-3 py-2 rounded-2xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="verizon">Verizon</option>
                <option value="att">AT&amp;T</option>
                <option value="spectrum">Spectrum / Charter</option>
                <option value="ringcentral">RingCentral / VoIP</option>
                <option value="other">Other carrier</option>
              </select>

              <ol className="mt-3 space-y-1.5 text-xs text-gray-600 leading-relaxed list-decimal list-inside">
                {CARRIER_STEPS[carrier].steps.map((step, i) => (
                  <li key={i} dangerouslySetInnerHTML={{
                    __html: step.replace(/\*\*(.*?)\*\*/g, "<span class='font-mono font-bold text-gray-900 bg-amber-50 px-1 rounded'>$1</span>")
                  }} />
                ))}
              </ol>

              {twilio?.phone_number && (
                <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                  Forward to: <span className="font-mono font-bold text-gray-900">{twilio.phone_number}</span>
                </p>
              )}
            </div>
          </div>

          {/* ── Card 3: Port your number ── */}
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-lg font-black">3</div>
              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-[10px] font-black rounded-full uppercase tracking-wider">Optional</span>
            </div>
            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Port Your Number</h3>
            <p className="text-xs text-gray-500 font-medium mt-1 mb-4">
              Later, move your original business number into Twilio so you don&apos;t need call forwarding at all.
            </p>

            <div className="mt-auto space-y-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">You&apos;ll need:</p>
              <ul className="text-xs text-gray-600 space-y-1 leading-relaxed">
                <li>• A recent phone bill (last 30 days)</li>
                <li>• Account PIN from your current carrier</li>
                <li>• Signed Letter of Authorization (LOA)</li>
              </ul>
              <a
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/port"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-4 py-2.5 bg-purple-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-purple-700 transition-colors mt-3"
              >
                Open Port Request →
              </a>
              <p className="text-[10px] text-gray-400 font-medium text-center">
                Port takes 7–14 days. AI keeps working throughout.
              </p>
            </div>
          </div>
        </div>

        {/* Twilio credentials form (expandable under Card 1) */}
        {showTwilioForm && !twilio?.connected && (
          <div className="mt-4 bg-white rounded-3xl border border-indigo-200 shadow-sm p-6 space-y-4">
            <div className="flex items-start gap-4">
              <span className="text-xl flex-shrink-0">🔐</span>
              <div className="flex-1">
                <p className="text-sm font-black text-gray-900">Paste your Twilio credentials</p>
                <p className="text-xs text-gray-500 mt-1">
                  Find these in{" "}
                  <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">
                    Twilio Console → Account Info
                  </a>
                  . We&apos;ll verify them with Twilio before saving.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account SID</label>
                <input
                  type="text"
                  value={twilioForm.account_sid}
                  onChange={(e) => setTwilioForm((f) => ({ ...f, account_sid: e.target.value }))}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full mt-1 px-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Auth Token</label>
                <input
                  type="password"
                  value={twilioForm.auth_token}
                  onChange={(e) => setTwilioForm((f) => ({ ...f, auth_token: e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full mt-1 px-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Twilio Phone Number (E.164)</label>
                <input
                  type="tel"
                  value={twilioForm.phone_number}
                  onChange={(e) => setTwilioForm((f) => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+14155550199"
                  className="w-full mt-1 px-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-gray-400 mt-1 ml-1">
                  The Twilio number that customers will call to reach your AI receptionist.
                </p>
              </div>
            </div>

            {twilioError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 font-medium">
                {twilioError}
              </div>
            )}

            <button
              onClick={saveTwilio}
              disabled={twilioBusy}
              className="w-full px-4 py-3 bg-gray-900 text-white text-sm font-black uppercase tracking-wider rounded-2xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {twilioBusy ? "Verifying with Twilio…" : "Verify & Connect"}
            </button>
          </div>
        )}

        {/* Test SMS block — only when connected */}
        {twilio?.connected && (
          <div className="mt-4 bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <span className="text-xl flex-shrink-0">🧪</span>
              <div className="flex-1">
                <p className="text-sm font-black text-gray-900">Send a test SMS</p>
                <p className="text-xs text-gray-500 mt-1">
                  Verify the forwarding pipeline works end-to-end. The test will arrive from {twilio.phone_number}.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <input
                type="tel"
                value={testTarget}
                onChange={(e) => setTestTarget(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={sendTestSms}
                className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                Send Test
              </button>
            </div>

            {testResult && (
              <div className={`mt-3 px-4 py-2.5 rounded-2xl text-sm font-medium ${
                testResult.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {testResult.ok ? "✅ " : "⚠️ "}{testResult.msg}
              </div>
            )}
          </div>
        )}

        {twilioMsg && !showTwilioForm && (
          <p className="mt-3 text-xs font-bold text-emerald-700">{twilioMsg}</p>
        )}
      </div>

      {/* ── Provider status pill ── */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex items-center gap-5">
        <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl flex-shrink-0">
          📅
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Current Booking Mode</p>
          <p className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">
            {settings.booking_forward_enabled ? "Staff Notification Forwarding" : "AI Internal Calendar"}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {settings.booking_forward_enabled
              ? "AI collects details, then your team gets an instant SMS to confirm."
              : "AI books directly to your internal calendar. Enable forwarding below to loop in your team."}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${
          settings.booking_forward_enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }`}>
          {settings.booking_forward_enabled ? "Active" : "Off"}
        </div>
      </div>

      {/* ── Staff Notification Forwarding ── */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Section header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Staff Notification Forwarding</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-lg">
              When a caller requests an appointment, the AI captures their info and
              instantly texts your designated team members so they can confirm directly.
              Works with any booking system — no API integration required.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 mt-1">
            <span className={`text-sm font-bold ${settings.booking_forward_enabled ? "text-indigo-600" : "text-gray-400"}`}>
              {settings.booking_forward_enabled ? "On" : "Off"}
            </span>
            <Toggle
              enabled={settings.booking_forward_enabled}
              onChange={() => setSettings((s) => ({ ...s, booking_forward_enabled: !s.booking_forward_enabled }))}
            />
          </div>
        </div>

        {/* Expandable config — only shown when enabled */}
        {settings.booking_forward_enabled && (
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
        )}

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

      {/* ── Direct Integrations (read-only) ── */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Direct Booking Integrations</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-60 grayscale-[0.4]">
          {[
            { letter: "V", bg: "bg-orange-50", text: "text-orange-600", name: "Vagaro" },
            { letter: "A", bg: "bg-black", text: "text-white", name: "Acuity" },
            { letter: "M", bg: "bg-sky-50", text: "text-sky-600", name: "Mindbody" },
          ].map(({ letter, bg, text, name }) => (
            <div key={name} className="p-6 rounded-3xl border border-gray-100 bg-white flex items-center gap-4">
              <div className={`w-10 h-10 ${bg} ${text} rounded-xl flex items-center justify-center text-lg font-black`}>{letter}</div>
              <div>
                <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{name}</p>
                <p className="text-xs text-gray-400 font-medium">Contact us to activate</p>
              </div>
            </div>
          ))}
        </div>
      </div>

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
                      <div className="col-span-2 bg-white rounded-2xl border border-gray-200 px-4 py-3 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Backup Slots</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.backup_slots || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Time Preference</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.time_preference || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Provider Pref.</p>
                          <p className="text-sm font-medium text-gray-700 mt-0.5">{req.provider_preference || "—"}</p>
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
