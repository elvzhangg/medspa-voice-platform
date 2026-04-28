"use client";

import { useCallback, useEffect, useState } from "react";
import { PLATFORM_COLORS } from "./platforms";

/**
 * Sync status pill + "Sync now" button. Drop in at the top of any
 * dashboard page that displays platform-synced data (calendar,
 * providers, clients) so users can refresh without bouncing between
 * tabs. Hidden entirely when the tenant isn't connected.
 *
 * Behavior:
 *   - On mount: fetch /api/integrations/me and render only if connected.
 *   - On click: POST /api/integrations/me/sync (full sync — providers +
 *     appointments + clients). Optimistically updates the timestamp
 *     and calls onSyncComplete so the host page can refetch its data.
 *   - 429 cooldown surfaces as a friendly inline message; other errors
 *     show the raw message.
 *
 * NOTE: each page mounts its own copy, so on a screen with multiple
 * SyncStatusBars (none today) you'd refetch the integration in each
 * one. Cheap GET — fine for now.
 */

interface IntegrationStatus {
  platform: string | null;
  status: "pending" | "connected" | "error" | "disabled";
  last_synced_at: string | null;
}

function formatSyncAgo(iso: string | null): string {
  if (!iso) return "awaiting first sync";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `synced ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `synced ${days}d ago`;
}

interface Props {
  /**
   * Called after a successful sync. Use this to refetch your page's
   * data so the new platform records appear without a manual reload.
   */
  onSyncComplete?: () => void;
}

export default function SyncStatusBar({ onSyncComplete }: Props) {
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setIntegration(data))
      .catch(() => {});
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/me/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          res.status === 429
            ? `Just synced — try again in ${data.retryAfterSec ?? "a few"}s`
            : data.error || "Sync failed";
        setSyncError(msg);
      } else {
        setIntegration((prev) =>
          prev ? { ...prev, last_synced_at: data.last_synced_at } : prev
        );
        onSyncComplete?.();
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [onSyncComplete]);

  if (
    !integration?.platform ||
    integration.status !== "connected" ||
    !PLATFORM_COLORS[integration.platform]
  ) {
    return null;
  }

  const platformColor = PLATFORM_COLORS[integration.platform];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-zinc-200 rounded-2xl">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs font-bold text-zinc-800">
          {platformColor.label}
        </span>
        <span className="text-[11px] text-zinc-500">·</span>
        <span className="text-[11px] text-zinc-500">
          {syncing ? "syncing…" : formatSyncAgo(integration.last_synced_at)}
        </span>
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {syncError && (
        <span className="text-[11px] text-rose-600 font-medium">{syncError}</span>
      )}
    </div>
  );
}
