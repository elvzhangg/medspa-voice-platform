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
  | "vagaro"
  | "jane"
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
  vagaro: "Vagaro",
  jane: "Jane",
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
  vagaro: "hybrid",
  jane: "sms_fallback",
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
    credentials: ["business_id", "api_key"],
    config: ["location_id"],
    help: "Boulevard partner API. Requires 3-week approval. api_key comes from their Partners portal.",
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
  vagaro: {
    credentials: ["api_key"],
    config: [],
    help: "Vagaro typically read-only — hybrid mode (AI verifies availability, staff confirms via SMS).",
  },
  jane: {
    credentials: [],
    config: [],
    help: "No public booking API. Runs in SMS fallback mode.",
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
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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
  const noApi = spec.credentials.length === 0 && spec.config.length === 0;

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

        {!noApi && (
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
            credentials needed here; the SMS forward numbers live on the tenant's scheduling page.
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
