"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Toggle from "../_components/Toggle";

interface VoiceOption {
  id: string;
  name: string;
  tagline: string;
  sampleUrl: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "rachel",
    name: "Rachel",
    tagline: "Professional, warm — the default receptionist",
    sampleUrl: "/api/voices/rachel/sample",
  },
  {
    id: "drew",
    name: "Drew",
    tagline: "Medical, direct — calm and reassuring",
    sampleUrl: "/api/voices/drew/sample",
  },
  {
    id: "natasha",
    name: "Natasha",
    tagline: "Warm, engaging — conversational energy",
    sampleUrl: "/api/voices/natasha/sample",
  },
];

interface IdentitySettings {
  name: string;
  greeting_message: string;
  system_prompt_override: string;
  deposit_enabled: boolean;
  deposit_amount: number;
  payment_policy_notes: string;
  membership_enabled: boolean;
  membership_details: string;
  membership_signup_url: string;
  directions_parking_info: string;
}

interface CallSettings {
  ai_voice_id: string;
  voicemail_forwarding_number: string;
}

export default function ClinicSetupPage() {
  const [identity, setIdentity] = useState<IdentitySettings>({
    name: "",
    greeting_message: "",
    system_prompt_override: "",
    deposit_enabled: false,
    deposit_amount: 0,
    payment_policy_notes: "",
    membership_enabled: false,
    membership_details: "",
    membership_signup_url: "",
    directions_parking_info: "",
  });
  const [calls, setCalls] = useState<CallSettings>({
    ai_voice_id: "rachel",
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
          <Field label="Voice" hint="Click play to hear a sample before selecting.">
            <VoicePicker
              value={calls.ai_voice_id}
              onChange={(id) => setCalls({ ...calls, ai_voice_id: id })}
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
            hint="When on, the AI offers to text a payment link for the amount to secure the booking."
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
                  <span className="text-sm text-zinc-500 font-medium">$</span>
                  <input
                    type="number"
                    min={0}
                    value={identity.deposit_amount}
                    onChange={(e) =>
                      setIdentity({ ...identity, deposit_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-32 px-4 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-sm"
                  />
                </div>
              )}
            </div>
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
 * buttons, plus a "Custom voice" row for tenants who've cloned their
 * own voice (e.g. in ElevenLabs) and want to paste its voice ID.
 *
 * Sample audio lives at /public/voices/<id>.mp3. A single shared
 * audioRef ensures only one preview plays at a time.
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

  const isPreset = VOICE_OPTIONS.some((v) => v.id === value);
  const [customMode, setCustomMode] = useState(!isPreset && Boolean(value));
  const [customId, setCustomId] = useState(!isPreset ? value : "");

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
        const selected = !customMode && value === opt.id;
        const isPlaying = playing === opt.id;
        const isLoading = loadingId === opt.id;
        return (
          <div
            key={opt.id}
            onClick={() => {
              setCustomMode(false);
              onChange(opt.id);
            }}
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

      {/* Custom voice card — for tenants who've cloned their own voice */}
      <div
        className={`rounded-xl border transition-colors ${
          customMode ? "border-amber-400 bg-[#fdf9ec]" : "border-zinc-200 bg-white"
        }`}
      >
        <div
          onClick={() => {
            setCustomMode(true);
            if (customId) onChange(customId);
          }}
          className="flex items-center gap-3 p-3 cursor-pointer"
        >
          <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white border border-zinc-300 text-zinc-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900">Custom voice</p>
            <p className="text-xs text-zinc-500">
              Cloned your own voice? Paste its ID below — we'll use it on every call.
            </p>
          </div>
          {customMode && (
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
          )}
        </div>
        {customMode && (
          <div className="px-3 pb-3">
            <input
              type="text"
              value={customId}
              onChange={(e) => {
                setCustomId(e.target.value);
                onChange(e.target.value);
              }}
              placeholder="Voice ID (e.g. from ElevenLabs)"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:ring-2 focus:ring-amber-400 outline-none transition-all text-sm"
            />
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Need help cloning your voice?{" "}
              <a
                href="mailto:founder@vauxvoice.com"
                className="text-amber-700 hover:text-amber-800 font-medium"
              >
                Contact founder@vauxvoice.com
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
