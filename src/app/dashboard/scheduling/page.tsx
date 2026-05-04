"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Tenant-facing scheduling settings:
 *   - Service durations (per-service, with a "default" fallback)
 *   - Buffer time between appointments
 *
 * Working hours are NOT here — they're per-staff and live on /dashboard/staff.
 * This page is for tenant-level scheduling defaults that the AI uses both
 * for quoting durations during calls AND for reserving the right amount of
 * time on the calendar when booking.
 */

interface ServiceDurationRow {
  // Client-side row-id so we can edit/remove rows before save without
  // colliding on duplicate names. Not persisted.
  rowId: string;
  name: string;
  minutes: number;
}

interface Settings {
  service_durations: Record<string, number>;
  buffer_min: number;
}

function buildRows(durations: Record<string, number>): ServiceDurationRow[] {
  return Object.entries(durations)
    .filter(([k]) => k !== "default")
    .map(([name, minutes], i) => ({
      rowId: `r-${i}-${Date.now()}`,
      name,
      minutes,
    }));
}

function rowsToDurations(
  rows: ServiceDurationRow[],
  defaultMinutes: number
): Record<string, number> {
  const out: Record<string, number> = { default: defaultMinutes };
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const n = Math.round(r.minutes);
    if (isNaN(n) || n <= 0) continue;
    out[name] = n;
  }
  return out;
}

export default function SchedulingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [defaultMin, setDefaultMin] = useState(60);
  const [bufferMin, setBufferMin] = useState(0);
  const [serviceRows, setServiceRows] = useState<ServiceDurationRow[]>([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduling");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as { settings: Settings };
      const s = data.settings;
      setDefaultMin(s.service_durations?.default ?? 60);
      setBufferMin(s.buffer_min ?? 0);
      setServiceRows(buildRows(s.service_durations ?? {}));
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function addRow() {
    setServiceRows((rows) => [
      ...rows,
      { rowId: `r-${Date.now()}-${Math.random()}`, name: "", minutes: 60 },
    ]);
  }

  function updateRow(rowId: string, patch: Partial<ServiceDurationRow>) {
    setServiceRows((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function removeRow(rowId: string) {
    setServiceRows((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    const service_durations = rowsToDurations(serviceRows, defaultMin);

    try {
      const res = await fetch("/api/scheduling", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_durations,
          buffer_min: bufferMin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage({ kind: "ok", text: "Saved." });
      // Re-load so any normalization (whitespace, default key) is reflected
      await loadSettings();
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Scheduling</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tell the AI how long each appointment takes and how much cleanup time you need
          between them. These settings affect what the AI quotes to callers and how it
          reserves time on your calendar.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Working hours are managed per provider on the{" "}
          <a href="/dashboard/staff" className="text-indigo-600 hover:underline">
            Staff page
          </a>
          .
        </p>
      </div>

      {/* Default duration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Default appointment length</h2>
        <p className="text-xs text-gray-500 mb-4">
          Used when a service isn&apos;t listed below. Most med spas pick 30 or 60 minutes.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={defaultMin}
            onChange={(e) => setDefaultMin(parseInt(e.target.value || "60", 10))}
            className="w-24 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          <span className="text-sm text-gray-600">minutes</span>
        </div>
      </div>

      {/* Per-service durations */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Per-service durations</h2>
        <p className="text-xs text-gray-500 mb-4">
          Override the default for specific services. Service name matching is
          case-insensitive — &quot;Botox&quot; will also match a caller asking for
          &quot;botox forehead&quot;.
        </p>

        {serviceRows.length === 0 ? (
          <div className="text-xs text-gray-400 italic mb-4">
            No services configured yet — all bookings will use the default duration above.
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {serviceRows.map((row) => (
              <div key={row.rowId} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Service name (e.g. HydraFacial)"
                  value={row.name}
                  onChange={(e) => updateRow(row.rowId, { name: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={row.minutes}
                  onChange={(e) =>
                    updateRow(row.rowId, { minutes: parseInt(e.target.value || "60", 10) })
                  }
                  className="w-20 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
                <span className="text-sm text-gray-500">min</span>
                <button
                  type="button"
                  onClick={() => removeRow(row.rowId)}
                  className="text-xs text-gray-400 hover:text-red-600 px-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
        >
          + Add service
        </button>
      </div>

      {/* Buffer time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Buffer between appointments</h2>
        <p className="text-xs text-gray-500 mb-4">
          Cleanup / turnover time between back-to-back bookings. Applied symmetrically —
          if you set 15 min, the AI won&apos;t book another appointment within 15 minutes
          before OR after an existing one.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={120}
            step={5}
            value={bufferMin}
            onChange={(e) => setBufferMin(parseInt(e.target.value || "0", 10))}
            className="w-24 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          <span className="text-sm text-gray-600">minutes</span>
        </div>
      </div>

      {/* Save bar */}
      {message && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            message.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
