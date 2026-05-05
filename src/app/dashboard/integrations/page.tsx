"use client";

import { useEffect, useState } from "react";

/**
 * Tenant-facing integrations page. Currently shows the Google Calendar
 * connect status + a "Connect with Google" button. Future: list other
 * platforms the tenant could connect (Mangomint link mode, etc.) here.
 *
 * Auth: protected by /dashboard/layout.tsx which redirects unauthenticated
 * users to /auth/login. The /api/google/start route also re-checks tenant
 * auth via getCurrentTenant.
 */

interface IntegrationStatus {
  platform: string | null;
  status: "pending" | "connected" | "error" | "disabled" | null;
  connectedAt: string | null;
  lastError: string | null;
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    () => {
      // Read OAuth callback query params on first mount (lazy initializer
      // avoids the react-hooks/set-state-in-effect lint issue).
      if (typeof window === "undefined") return null;
      const params = new URLSearchParams(window.location.search);
      if (params.get("gcal_connected")) {
        return {
          kind: "ok",
          text: "Google Calendar connected. Your AI receptionist can now read your availability and book real appointments.",
        };
      }
      const err = params.get("gcal_error");
      if (err) return { kind: "error", text: err };
      return null;
    }
  );

  // Strip the query params from the URL so a refresh doesn't re-show the toast.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_connected") || params.get("gcal_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/integrations/status");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled) return;
        setStatus(data);
      } catch (err) {
        if (cancelled) return;
        console.error("integrations status err:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isGoogleConnected =
    status?.platform === "google_calendar" && status?.status === "connected";
  const isGooglePending =
    status?.platform === "google_calendar" && status?.status === "pending";
  const otherPlatform =
    status?.platform && status.platform !== "google_calendar" ? status.platform : null;

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your booking and calendar tools so the AI can read availability and create
          real appointments on your behalf.
        </p>
      </div>

      {message && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-6 flex items-start justify-between gap-3 ${
            message.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-xs opacity-60 hover:opacity-100 shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Google Calendar card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
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
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Google Calendar</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Connect your Google account so the AI can check availability and book real
                appointments on your calendar.
              </p>
              {loading ? (
                <p className="text-xs text-gray-400 mt-2">Loading status…</p>
              ) : isGoogleConnected ? (
                <p className="text-xs text-green-600 font-medium mt-2">
                  Connected
                  {status?.connectedAt && (
                    <span className="text-gray-500 font-normal">
                      {" "}
                      since {new Date(status.connectedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              ) : isGooglePending ? (
                <p className="text-xs text-amber-600 font-medium mt-2">
                  Authorization received — waiting for setup to complete.
                </p>
              ) : otherPlatform ? (
                <p className="text-xs text-gray-500 mt-2">
                  Currently using <span className="font-semibold">{otherPlatform}</span>. Connecting
                  Google will switch your AI receptionist over.
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">Not connected.</p>
              )}
            </div>
          </div>

          <a
            href="/api/google/start"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-sm font-semibold rounded-lg text-gray-700 shadow-sm shrink-0"
          >
            {isGoogleConnected ? "Re-connect" : "Connect with Google"}
          </a>
        </div>

        {/* Help / what happens when you click */}
        <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
          <p>When you click Connect:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>You&apos;ll go to Google to log in (we never see your password)</li>
            <li>Google asks if you allow VauxVoice to access your calendar</li>
            <li>Once you approve, the AI can read your availability and book new events</li>
            <li>You can revoke access any time at <span className="font-mono">myaccount.google.com/permissions</span></li>
          </ul>
        </div>

        {status?.lastError && (
          <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Last error: {status.lastError}
          </div>
        )}
      </div>
    </div>
  );
}
