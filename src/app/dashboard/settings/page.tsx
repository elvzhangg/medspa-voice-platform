"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Toggle from "../_components/Toggle";

interface VoiceOption {
  id: string;
  name: string;
  tagline: string;
  sampleUrl: string;
}

// Curated ElevenLabs voices — one per category. Tenants self-serve from
// this list; anything else routes to founder@vauxvoice.com.
// The id IS the ElevenLabs voice ID — stored directly in tenants.voice_id
// and consumed unchanged by Vapi at call time.
const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    tagline: "Warm & reassuring — mature, trustworthy tone",
    sampleUrl: "/api/voices/EXAVITQu4vr4xnSDxMaL/sample",
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    tagline: "Professional — calm, clear, easy to follow",
    sampleUrl: "/api/voices/21m00Tcm4TlvDq8ikWAM/sample",
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    tagline: "Young & expressive — friendly, upbeat energy",
    sampleUrl: "/api/voices/MF3mGyEYCl7XYWbV9V6O/sample",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    tagline: "Warm male — approachable, conversational",
    sampleUrl: "/api/voices/ErXwobaYiN019PkySvjV/sample",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    tagline: "Calm male — steady, authoritative",
    sampleUrl: "/api/voices/onwK4e9ZLuTAKqWW03F9/sample",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    tagline: "Deep male — rich low end, narrator gravitas",
    sampleUrl: "/api/voices/pNInz6obpgDQGcFmaJgB/sample",
  },
];

interface DepositByServiceRow {
  service: string;
  amount: number;
}

interface PaymentMethodsMap {
  stripe: { enabled: boolean };
  square: { enabled: boolean; payment_link_url: string };
  paypal: { enabled: boolean; handle: string };
  venmo: { enabled: boolean; handle: string };
  zelle: { enabled: boolean; handle: string };
  cash: { enabled: boolean };
  care_credit: { enabled: boolean; application_url: string };
  cherry: { enabled: boolean; application_url: string };
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodsMap = {
  stripe: { enabled: true },
  square: { enabled: false, payment_link_url: "" },
  paypal: { enabled: false, handle: "" },
  venmo: { enabled: false, handle: "" },
  zelle: { enabled: false, handle: "" },
  cash: { enabled: false },
  care_credit: { enabled: false, application_url: "" },
  cherry: { enabled: false, application_url: "" },
};

interface IdentitySettings {
  name: string;
  greeting_message: string;
  system_prompt_override: string;
  deposit_enabled: boolean;
  deposit_amount: number;
  deposit_by_service: DepositByServiceRow[];
  payment_methods: PaymentMethodsMap;
  payment_policy_notes: string;
  membership_enabled: boolean;
  membership_details: string;
  membership_signup_url: string;
  directions_parking_info: string;
}

interface CallSettings {
  voice_id: string;
  voicemail_forwarding_number: string;
}

export default function ClinicSetupPage() {
  const [identity, setIdentity] = useState<IdentitySettings>({
    name: "",
    greeting_message: "",
    system_prompt_override: "",
    deposit_enabled: false,
    deposit_amount: 0,
    deposit_by_service: [],
    payment_methods: DEFAULT_PAYMENT_METHODS,
    payment_policy_notes: "",
    membership_enabled: false,
    membership_details: "",
    membership_signup_url: "",
    directions_parking_info: "",
  });
  const [calls, setCalls] = useState<CallSettings>({
    voice_id: VOICE_OPTIONS[0].id,
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
    if (iRes.ok) {
      const data = await iRes.json();
      setIdentity({
        ...data,
        deposit_by_service: Array.isArray(data.deposit_by_service)
          ? data.deposit_by_service
          : [],
        payment_methods: {
          ...DEFAULT_PAYMENT_METHODS,
          ...(data.payment_methods ?? {}),
        },
      });
    }
    if (cRes.ok) {
      const data = await cRes.json();
      setCalls({
        voice_id: data.voice_id ?? VOICE_OPTIONS[0].id,
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
    return <div className="p-10 text-center text-zinc-400 text-sm">Loading clinic setup…</div>;
  }

  return (
    <div className="max-w-3xl pb-24">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-zinc-900">Clinic Setup</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Section
          title="Clinic Profile"
          subtitle="Who your AI says it represents."
          icon={
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        >
          <Field label="Clinic Display Name">
            <input
              type="text"
              value={identity.name}
              onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm"
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
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm resize-none"
              placeholder="e.g. We're at 123 Main St, on the 2nd floor. Free parking in the lot behind the building."
            />
          </Field>
        </Section>

        <Section
          title="Voice & Personality"
          subtitle="How your AI sounds and what it prioritizes."
          icon={
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          }
        >
          <Field label="Voice">
            <VoicePicker
              value={calls.voice_id}
              onChange={(id) => setCalls({ ...calls, voice_id: id })}
            />
          </Field>
          <Field
            label="Greeting Message"
            hint="The first thing callers hear when they call your number."
          >
            <textarea
              rows={3}
              value={identity.greeting_message}
              onChange={(e) => setIdentity({ ...identity, greeting_message: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm resize-none"
              placeholder="Welcome to [Clinic]! We're delighted to hear from you. Anything I can help you with today?"
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
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm resize-none font-mono"
              placeholder={`e.g.\n- Always emphasize our free consultation offer\n- Upsell our monthly membership plan to new callers\n- Do not discuss competitor pricing`}
            />
          </Field>
        </Section>

        <Section
          title="Live Transfer"
          subtitle="When a caller asks to speak to a human, the AI transfers them here."
          icon={
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
        >
          <Field
            label="Live Transfer Number"
            hint="Recommended to keep one on file for the occasional caller who insists on a person. Leave blank to disable."
          >
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={calls.voicemail_forwarding_number}
              onChange={(e) => setCalls({ ...calls, voicemail_forwarding_number: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm"
            />
          </Field>
        </Section>

        <Section
          title="Booking & Billing"
          subtitle="Rules the AI follows when securing an appointment or discussing payment."
          icon={
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
        >
          <Field
            label="Booking Deposit"
            hint="When on, the AI offers to text a payment link for the amount to secure the booking. Set a default below, or override per-service."
          >
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Toggle
                  enabled={identity.deposit_enabled}
                  onChange={() =>
                    setIdentity({ ...identity, deposit_enabled: !identity.deposit_enabled })
                  }
                  ariaLabel="Enable booking deposit"
                />
                <span className="text-xs font-bold text-zinc-500">
                  {identity.deposit_enabled ? "ON" : "OFF"}
                </span>
              </div>
              {identity.deposit_enabled && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 font-medium">Default</span>
                  <span className="text-sm text-zinc-500 font-medium">$</span>
                  <input
                    type="number"
                    min={0}
                    value={identity.deposit_amount}
                    onChange={(e) =>
                      setIdentity({ ...identity, deposit_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-28 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm"
                  />
                </div>
              )}
            </div>
          </Field>
          {identity.deposit_enabled && (
            <Field
              label="Deposits by service"
              hint="Optional per-service overrides. Anything not listed uses the default above. The AI matches the caller's requested service against this list (case-insensitive)."
            >
              <DepositsByServiceEditor
                rows={identity.deposit_by_service}
                onChange={(next) => setIdentity({ ...identity, deposit_by_service: next })}
              />
            </Field>
          )}
          <Field
            label="Payment methods accepted"
            hint="Turn on the methods you accept. The AI will mention them when cost comes up and can text the relevant link or handle."
          >
            <PaymentMethodsEditor
              methods={identity.payment_methods}
              onChange={(next) => setIdentity({ ...identity, payment_methods: next })}
            />
          </Field>
          <Field
            label="Payment & Financing Notes"
            hint="Short rules the AI applies when callers ask about cost. Longer policies (refunds, detailed pricing) belong in Clinic Handbook."
          >
            <textarea
              rows={4}
              value={identity.payment_policy_notes}
              onChange={(e) => setIdentity({ ...identity, payment_policy_notes: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm resize-none"
              placeholder={`e.g.\n- Mention CareCredit and Cherry financing for treatments over $500\n- Deposits are refundable with 24h notice\n- We accept HSA/FSA cards`}
            />
          </Field>
          <Field
            label="Membership Program"
            hint="When on, the AI can mention your membership when pricing or loyalty comes up, and offer to text the signup link."
          >
            <div className="flex items-center gap-3 mb-3">
              <Toggle
                enabled={identity.membership_enabled}
                onChange={() =>
                  setIdentity({ ...identity, membership_enabled: !identity.membership_enabled })
                }
                ariaLabel="Enable membership program"
              />
              <span className="text-xs font-bold text-zinc-500">
                {identity.membership_enabled ? "ON" : "OFF"}
              </span>
            </div>
            {identity.membership_enabled && (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={identity.membership_details}
                  onChange={(e) =>
                    setIdentity({ ...identity, membership_details: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm resize-none"
                  placeholder={`e.g.\n- "Glow VIP" — $99/month: free monthly facial + 15% off services + member-only events\n- "Glow Gold" — $199/month: everything above + quarterly Botox credit`}
                />
                <input
                  type="url"
                  value={identity.membership_signup_url}
                  onChange={(e) =>
                    setIdentity({ ...identity, membership_signup_url: e.target.value })
                  }
                  placeholder="Signup link (Stripe subscription URL, membership landing page, etc.)"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm"
                />
              </div>
            )}
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
            className="px-6 py-2.5 bg-white text-amber-900 border border-amber-400 shadow-sm font-semibold rounded-lg hover:bg-[#fdf9ec] hover:border-amber-500 shadow-sm transition-all disabled:opacity-50 text-sm"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Editor for per-service deposit overrides. The caller's requested
 * service string is matched against these (case-insensitive, contains)
 * at prompt-build time; anything that doesn't match uses the default.
 */
function DepositsByServiceEditor({
  rows,
  onChange,
}: {
  rows: DepositByServiceRow[];
  onChange: (next: DepositByServiceRow[]) => void;
}) {
  function updateRow(i: number, patch: Partial<DepositByServiceRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }
  function addRow() {
    onChange([...rows, { service: "", amount: 0 }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-[11px] text-zinc-400 italic">No per-service overrides yet.</p>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={row.service}
              onChange={(e) => updateRow(i, { service: e.target.value })}
              placeholder="Service name (e.g. CoolSculpting)"
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:ring-2 focus:ring-amber-400 outline-none text-sm"
            />
            <span className="text-sm text-zinc-500 font-medium">$</span>
            <input
              type="number"
              min={0}
              value={row.amount}
              onChange={(e) => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
              className="w-24 px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:ring-2 focus:ring-amber-400 outline-none text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:text-red-500 hover:border-red-200 transition-colors"
              aria-label="Remove row"
            >
              ×
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={addRow}
        className="text-xs text-amber-700 hover:text-amber-800 font-medium"
      >
        + Add service override
      </button>
    </div>
  );
}

/**
 * Payment methods editor. Each method toggles on/off; when on, the
 * optional secondary field (URL or handle) appears. Stripe is
 * always-on-by-default since it's the only method actually wired for
 * dynamic on-call payment-link creation.
 */
function PaymentMethodsEditor({
  methods,
  onChange,
}: {
  methods: PaymentMethodsMap;
  onChange: (next: PaymentMethodsMap) => void;
}) {
  type Row = {
    key: keyof PaymentMethodsMap;
    label: string;
    description: string;
    field?: { key: string; placeholder: string; prefix?: string };
  };

  const rows: Row[] = [
    {
      key: "stripe",
      label: "Stripe",
      description: "Dynamic payment links for deposits. The AI handles creation + texting.",
    },
    {
      key: "square",
      label: "Square",
      description: "Tenants already on Square can paste a reusable Square payment link.",
      field: { key: "payment_link_url", placeholder: "https://square.link/..." },
    },
    {
      key: "paypal",
      label: "PayPal",
      description: "AI texts callers your PayPal handle if they prefer this.",
      field: { key: "handle", placeholder: "@yourhandle", prefix: "@" },
    },
    {
      key: "venmo",
      label: "Venmo",
      description: "Texted to callers on request.",
      field: { key: "handle", placeholder: "@yourhandle", prefix: "@" },
    },
    {
      key: "zelle",
      label: "Zelle",
      description: "AI texts the Zelle contact (phone or email) when asked.",
      field: { key: "handle", placeholder: "email or phone" },
    },
    {
      key: "cash",
      label: "Cash",
      description: "AI mentions as an in-person option when relevant.",
    },
    {
      key: "care_credit",
      label: "CareCredit",
      description: "Medical financing. AI texts your application link for treatments the caller flags as costly.",
      field: { key: "application_url", placeholder: "https://..." },
    },
    {
      key: "cherry",
      label: "Cherry financing",
      description: "Aesthetic-focused financing. AI texts your Cherry application link on cost-sensitive calls.",
      field: { key: "application_url", placeholder: "https://..." },
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map(({ key, label, description, field }) => {
        const method = methods[key] as any;
        const enabled = Boolean(method?.enabled);
        return (
          <div
            key={key}
            className={`rounded-xl border transition-colors ${
              enabled ? "border-amber-300 bg-[#fdf9ec]/60" : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-3 p-3">
              <Toggle
                enabled={enabled}
                onChange={() =>
                  onChange({
                    ...methods,
                    [key]: { ...method, enabled: !enabled },
                  })
                }
                ariaLabel={`Enable ${label}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{label}</p>
                <p className="text-[11px] text-zinc-500 truncate">{description}</p>
              </div>
            </div>
            {enabled && field && (
              <div className="px-3 pb-3">
                <div className="flex items-center gap-2">
                  {field.prefix && (
                    <span className="text-sm text-zinc-500 font-medium">{field.prefix}</span>
                  )}
                  <input
                    type="text"
                    value={(method?.[field.key] as string) ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...methods,
                        [key]: { ...method, [field.key]: e.target.value },
                      })
                    }
                    placeholder={field.placeholder}
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:ring-2 focus:ring-amber-400 outline-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
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
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
        <h2 className="font-semibold text-zinc-900 text-sm flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5 ml-6">{subtitle}</p>}
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
      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400 mt-1.5">{hint}</p>}
    </div>
  );
}

/**
 * Voice picker — card list of preset voices with play/pause sample
 * buttons. Samples generated on-demand via /api/voices/[id]/sample
 * (ElevenLabs proxy). Anything outside this list routes the tenant to
 * founder@vauxvoice.com so the VauxVoice team can add it admin-side.
 */
function VoicePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function togglePlay(opt: VoiceOption) {
    // Stop any currently-playing preview first — one at a time.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (playing === opt.id) {
      setPlaying(null);
      return;
    }

    setLoadingId(opt.id);
    try {
      const audio = new Audio(opt.sampleUrl);
      audio.onended = () => {
        setPlaying(null);
        setLoadingId(null);
      };
      audio.onerror = () => {
        setPlaying(null);
        setLoadingId(null);
      };
      await audio.play();
      audioRef.current = audio;
      setPlaying(opt.id);
      setLoadingId(null);
    } catch {
      setLoadingId(null);
      setPlaying(null);
    }
  }

  return (
    <div className="space-y-2">
      {VOICE_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        const isPlaying = playing === opt.id;
        const isLoading = loadingId === opt.id;
        return (
          <div
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              selected
                ? "border-amber-400 bg-[#fdf9ec]"
                : "border-zinc-200 bg-white hover:bg-zinc-50"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay(opt);
              }}
              disabled={isLoading}
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors"
              aria-label={isPlaying ? "Pause sample" : "Play sample"}
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="5" y="4" width="3" height="12" rx="1" />
                  <rect x="12" y="4" width="3" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 translate-x-[1px]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 4l10 6-10 6V4z" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{opt.name}</p>
              <p className="text-xs text-zinc-500 truncate">{opt.tagline}</p>
            </div>
            {selected && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
            )}
          </div>
        );
      })}

      <p className="text-xs text-zinc-400 pt-1">
        Want a different voice or a custom-cloned one?{" "}
        <a
          href="mailto:founder@vauxvoice.com?subject=Voice%20request"
          className="text-amber-700 hover:text-amber-800 font-medium"
        >
          Contact founder@vauxvoice.com
        </a>
        .
      </p>
    </div>
  );
}
