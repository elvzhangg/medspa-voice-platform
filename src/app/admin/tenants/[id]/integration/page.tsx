"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Platform =
  | "boulevard"
  | "acuity"
  | "mindbody"
  | "square"
  | "zenoti"
  | "wellnessliving"
  | "vagaro"
  | "jane"
  | "google_calendar"
  | "glossgenius"
  | "fresha"
  | "self_managed";

type Mode = "direct_book" | "hybrid" | "sms_fallback";

const PLATFORM_LABELS: Record<Platform, string> = {
  boulevard: "Boulevard",
  acuity: "Acuity Scheduling",
  mindbody: "Mindbody",
  square: "Square Appointments",
  zenoti: "Zenoti",
  wellnessliving: "WellnessLiving",
  vagaro: "Vagaro",
  jane: "Jane",
  google_calendar: "Google Calendar",
  glossgenius: "GlossGenius",
  fresha: "Fresha",
  self_managed: "Self-managed (no platform)",
};

const DEFAULT_MODE: Record<Platform, Mode> = {
  boulevard: "direct_book",
  acuity: "direct_book",
  mindbody: "direct_book",
  square: "direct_book",
  zenoti: "direct_book",
  wellnessliving: "direct_book",
  vagaro: "hybrid",
  jane: "hybrid",
  google_calendar: "direct_book",
  glossgenius: "sms_fallback",
  fresha: "sms_fallback",
  self_managed: "sms_fallback",
};

// Field hints per platform — keys the admin must fill into credentials / config
const FIELD_SPEC: Record<
  Platform,
  { credentials: string[]; config: string[]; help: string }
> = {
  boulevard: {
    credentials: ["business_id", "api_key", "webhook_secret"],
    config: ["location_id"],
    help: "Boulevard partner API. Requires 3-week approval. api_key comes from their Partners portal. webhook_secret is optional — paste the HMAC secret from Boulevard's webhook setup so realtime calendar sync works.",
  },
  acuity: {
    credentials: ["user_id", "api_key"],
    config: [],
    help: "Acuity Scheduling self-serve API. user_id + api_key from Integrations → API.",
  },
  mindbody: {
    credentials: ["site_id", "api_key", "source_name"],
    config: ["location_id"],
    help: "Mindbody Public API v6. Slow approval; source_name must match registered app.",
  },
  square: {
    credentials: ["access_token"],
    config: ["location_id"],
    help: "Square Appointments via OAuth. access_token is the merchant-scoped token.",
  },
  zenoti: {
    credentials: ["api_key"],
    config: ["center_id"],
    help: "Zenoti enterprise API. Requires partner enablement.",
  },
  wellnessliving: {
    credentials: ["api_key", "app_id", "app_secret"],
    config: ["business_id"],
    help: "WellnessLiving Developer API — Account Executive must enable it on the plan. Use api_key if the tenant has one, otherwise app_id + app_secret for signed requests.",
  },
  vagaro: {
    credentials: ["api_key"],
    config: ["business_id"],
    help: "Vagaro API is read-only. Runs in hybrid mode: AI verifies availability, staff confirms the booking via SMS.",
  },
  jane: {
    credentials: ["api_key"],
    config: ["clinic_id"],
    help: "Jane Partner API — write scopes are gated, so we run hybrid: AI verifies availability, staff confirms via SMS.",
  },
  google_calendar: {
    // Credentials are issued via OAuth — there's no field to paste. The
    // 'Connect with Google' button below replaces the credential form.
    credentials: [],
    // Admin-only integration plumbing. Tenant-editable scheduling settings
    // (working hours, service durations, buffer time) live in tenant tables
    // (staff.working_hours + tenants.booking_settings) and are managed via
    // /dashboard/staff and /dashboard/scheduling — NOT here. Keeps the
    // separation of "integration plumbing" (admin) vs "business operations"
    // (tenant) clean.
    config: ["timezone", "default_calendar_id", "provider_calendars"],
    help: "Connect a Google account to read availability and create real bookings. Free, self-serve, no API approval. Working hours are read from each staff member's settings (/dashboard/staff). Service durations and buffer time live on /dashboard/scheduling.",
  },
  glossgenius: {
    credentials: [],
    config: [],
    help: "No public API. Runs in SMS fallback mode.",
  },
  fresha: {
    credentials: [],
    config: [],
    help: "No public API. Runs in SMS fallback mode.",
  },
  self_managed: {
    credentials: [],
    config: [],
    help: "No external platform — everything flows through staff SMS.",
  },
};

interface Integration {
  id: string;
  platform: Platform;
  mode: Mode;
  credentials: Record<string, string>;
  config: Record<string, string>;
  last_test_at: string | null;
  last_test_status: string | null;
  last_error: string | null;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  integration_platform: Platform | null;
  integration_mode: Mode | null;
  integration_status: "pending" | "connected" | "error" | "disabled" | null;
  integration_connected_at: string | null;
  integration_last_error: string | null;
}

export default function AdminIntegrationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);

  const [platform, setPlatform] = useState<Platform>("boulevard");
  const [mode, setMode] = useState<Mode>("direct_book");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  // Lazy initializer: read OAuth callback query params on first mount so we can
  // surface "connected" / "error" toasts coming back from /api/admin/google/callback.
  // Doing this in a useState initializer (instead of an effect) avoids the
  // react-hooks/set-state-in-effect lint warning since we set the initial value
  // synchronously rather than re-rendering.
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_connected")) {
      return {
        kind: "ok",
        text: "Google Calendar connected. Now pick which calendars map to providers, then Test connection.",
      };
    }
    const err = params.get("gcal_error");
    if (err) return { kind: "error", text: err };
    return null;
  });

  async function load() {
    const res = await fetch(`/api/admin/tenants/${id}/integration`);
    if (res.ok) {
      const data = await res.json();
      setTenant(data.tenant);
      if (data.integration) {
        setIntegration(data.integration);
        setPlatform(data.integration.platform);
        setMode(data.integration.mode);
        setCredentials(data.integration.credentials || {});
        setConfig(data.integration.config || {});
      } else if (data.tenant.integration_platform) {
        setPlatform(data.tenant.integration_platform);
        setMode(data.tenant.integration_mode || DEFAULT_MODE[data.tenant.integration_platform as Platform]);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  // After the lazy initializer above reads the OAuth callback query params,
  // strip them from the URL so a refresh doesn't re-trigger the toast. This
  // effect only mutates browser history (no React state), so it's safe under
  // the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_connected") || params.get("gcal_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function handlePlatformChange(p: Platform) {
    setPlatform(p);
    setMode(DEFAULT_MODE[p]);
    // Prune fields that don't apply to the new platform
    const spec = FIELD_SPEC[p];
    const filteredCreds: Record<string, string> = {};
    spec.credentials.forEach((k) => (filteredCreds[k] = credentials[k] || ""));
    setCredentials(filteredCreds);
    const filteredConfig: Record<string, string> = {};
    spec.config.forEach((k) => (filteredConfig[k] = config[k] || ""));
    setConfig(filteredConfig);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/tenants/${id}/integration`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, mode, credentials, config }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ kind: "ok", text: "Saved. Hit Test to verify credentials." });
      load();
    } else {
      const err = await res.json();
      setMessage({ kind: "error", text: err.error || "Save failed" });
    }
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    const res = await fetch(`/api/admin/tenants/${id}/integration/test`, { method: "POST" });
    const data = await res.json();
    setTesting(false);
    if (data.ok) {
      setMessage({ kind: "ok", text: "Integration test passed. Tenant is now marked connected." });
    } else {
      setMessage({ kind: "error", text: data.error || "Test failed" });
    }
    load();
  }

  async function disconnect() {
    if (!confirm("Disconnect this integration? The tenant will fall back to pending state.")) return;
    await fetch(`/api/admin/tenants/${id}/integration`, { method: "DELETE" });
    setIntegration(null);
    setCredentials({});
    setConfig({});
    load();
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;
  if (!tenant) return <div className="text-red-500 text-sm">Tenant not found.</div>;

  const spec = FIELD_SPEC[platform];
  const isGoogle = platform === "google_calendar";
  const noApi = !isGoogle && spec.credentials.length === 0 && spec.config.length === 0;
  // For OAuth platforms (Google Calendar), the row exists once the user
  // completes the OAuth flow — even if they haven't filled in config yet.
  const oauthConnected =
    isGoogle && integration?.platform === "google_calendar";

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1 text-sm">
          <Link href="/admin/tenants" className="text-gray-500 hover:text-gray-700">Tenants</Link>
          <span className="text-gray-300">/</span>
          <Link href={`/admin/tenants/${id}`} className="text-gray-500 hover:text-gray-700">{tenant.name}</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Integration</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Booking Platform Integration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure how the AI should read availability and create bookings for {tenant.name}.
        </p>
      </div>

      {/* Current status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Current status</h2>
        <div className="flex items-center gap-3">
          <StatusPill status={tenant.integration_status || "pending"} />
          <div className="text-sm text-gray-700">
            {tenant.integration_platform ? (
              <>
                <span className="font-semibold">{PLATFORM_LABELS[tenant.integration_platform]}</span>{" "}
                <span className="text-gray-400">·</span>{" "}
                <span>{modeLabel(tenant.integration_mode)}</span>
                {tenant.integration_connected_at && (
                  <span className="text-gray-400 ml-2">
                    connected {new Date(tenant.integration_connected_at).toLocaleDateString()}
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-400">No platform configured yet</span>
            )}
          </div>
        </div>
        {tenant.integration_last_error && (
          <p className="text-xs text-red-600 mt-2">Last error: {tenant.integration_last_error}</p>
        )}
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Booking platform</label>
          <select
            value={platform}
            onChange={(e) => handlePlatformChange(e.target.value as Platform)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          >
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1.5">{spec.help}</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Integration mode</label>
          <div className="grid grid-cols-3 gap-2">
            {(["direct_book", "hybrid", "sms_fallback"] as Mode[]).map((m) => (
              <label
                key={m}
                className={`cursor-pointer text-center px-3 py-2 rounded-lg border text-xs font-medium transition ${
                  mode === m
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="sr-only"
                />
                {modeLabel(m)}
              </label>
            ))}
          </div>
        </div>

        {/* Google Calendar: OAuth flow replaces credential paste. */}
        {isGoogle && (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900">
              <p className="font-semibold mb-1">OAuth-based connection</p>
              <p className="text-xs leading-relaxed">
                Click below to connect a Google account. You&apos;ll be redirected to Google to grant
                Calendar access. After authorizing, you&apos;ll come back here to map calendars to
                providers and run a connection test. No credentials get pasted or stored in this
                form.
              </p>
            </div>

            <a
              href={`/api/admin/google/start?tenant=${id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-sm font-semibold rounded-lg text-gray-700 shadow-sm"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
              {oauthConnected ? "Re-connect Google Calendar" : "Connect with Google"}
            </a>

            {oauthConnected && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800">
                Google account connected. Run <b>Test connection</b> below to fetch your calendars,
                then fill in the configuration fields:
                <ul className="list-disc ml-5 mt-2 space-y-0.5">
                  <li><span className="font-mono">timezone</span>: e.g., <span className="font-mono">America/Los_Angeles</span></li>
                  <li><span className="font-mono">default_calendar_id</span>: leave as <span className="font-mono">primary</span> or paste a specific calendar ID</li>
                  <li><span className="font-mono">service_duration_min</span>: default appointment length, e.g., <span className="font-mono">60</span></li>
                  <li><span className="font-mono">working_hours_start</span> / <span className="font-mono">working_hours_end</span>: e.g., <span className="font-mono">09:00</span> / <span className="font-mono">17:00</span></li>
                  <li><span className="font-mono">provider_calendars</span>: optional JSON map, e.g. <span className="font-mono">{`{"Dr. Chen":"abc@group.calendar.google.com"}`}</span></li>
                </ul>
              </div>
            )}

            {spec.config.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 mb-2">Configuration</h3>
                <div className="space-y-2">
                  {spec.config.map((k) => (
                    <KVField
                      key={k}
                      label={k}
                      value={config[k] || ""}
                      onChange={(v) => setConfig({ ...config, [k]: v })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!noApi && !isGoogle && (
          <>
            {spec.credentials.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 mb-2">Credentials (secret — never exposed to tenant)</h3>
                <div className="space-y-2">
                  {spec.credentials.map((k) => (
                    <KVField
                      key={k}
                      label={k}
                      value={credentials[k] || ""}
                      onChange={(v) => setCredentials({ ...credentials, [k]: v })}
                      secret
                    />
                  ))}
                </div>
              </div>
            )}
            {spec.config.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 mb-2">Configuration</h3>
                <div className="space-y-2">
                  {spec.config.map((k) => (
                    <KVField
                      key={k}
                      label={k}
                      value={config[k] || ""}
                      onChange={(v) => setConfig({ ...config, [k]: v })}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {noApi && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            This platform has no public API — the tenant will run in <b>SMS fallback</b> mode. No
            credentials needed here; the SMS forward numbers live on the tenant&apos;s scheduling page.
          </div>
        )}

        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              message.kind === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={test}
            disabled={testing || !integration}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg disabled:opacity-40"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {integration && (
            <button
              onClick={disconnect}
              className="ml-auto px-4 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-semibold rounded-lg"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Webhook listener URL — paste into the platform's webhook config
          so they push appointment changes back to us in real time. */}
      {integration && platform === "boulevard" && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Realtime calendar sync
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Paste this URL into Boulevard&apos;s webhook settings so appointments booked
            or cancelled in their UI flow back into the VauxVoice calendar automatically.
            Pair it with the <span className="font-mono">webhook_secret</span> you set above
            (Boulevard signs each request; we verify before accepting).
          </p>
          <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
            {typeof window !== "undefined" ? window.location.origin : ""}
            /api/webhooks/platform/{platform}/{id}
          </div>
        </div>
      )}
    </div>
  );
}

function modeLabel(m: Mode | null | undefined): string {
  if (m === "direct_book") return "Direct booking";
  if (m === "hybrid") return "Hybrid (verify + SMS)";
  if (m === "sms_fallback") return "SMS fallback";
  return "—";
}

function StatusPill({
  status,
}: {
  status: "pending" | "connected" | "error" | "disabled";
}) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "Connected", cls: "bg-green-100 text-green-700" },
    pending: { label: "Pending setup", cls: "bg-amber-100 text-amber-700" },
    error: { label: "Error", cls: "bg-red-100 text-red-700" },
    disabled: { label: "Disabled", cls: "bg-gray-100 text-gray-600" },
  };
  const m = map[status] || map.pending;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.cls}`}>{m.label}</span>
  );
}

function KVField({
  label,
  value,
  onChange,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <label className="text-[11px] text-gray-500 mb-0.5 block font-mono">{label}</label>
      <div className="flex gap-2">
        <input
          type={secret && !reveal ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none font-mono"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}
