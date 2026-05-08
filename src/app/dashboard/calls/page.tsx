import { headers } from "next/headers";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import CallRow, { type CallLog } from "./CallRow";

export default async function CallLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string }>;
}) {
  const tenant = (await getCurrentTenant()) as { id: string; slug: string } | null;
  if (!tenant) return null;

  const { call: highlightedCallId } = await searchParams;

  const { data } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, duration_seconds, summary, transcript, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const callRows = (data ?? []) as Array<{
    id: string;
    vapi_call_id: string;
    caller_number: string | null;
    duration_seconds: number | null;
    summary: string | null;
    transcript: string | null;
    created_at: string;
  }>;

  // Attach AI-recorded follow-up tasks per call. Tasks may link via the
  // legacy vapi_call_id (live calls) or via the newer call_log_id
  // (chat/backfill/manual). We pull both flavors in one query and dedupe
  // by row id below.
  const vapiIds = callRows.map((c) => c.vapi_call_id).filter(Boolean);
  const callIds = callRows.map((c) => c.id);
  const filterParts: string[] = [];
  if (vapiIds.length) {
    filterParts.push(`vapi_call_id.in.(${vapiIds.map((v) => `"${v}"`).join(",")})`);
  }
  if (callIds.length) {
    filterParts.push(`call_log_id.in.(${callIds.map((c) => `"${c}"`).join(",")})`);
  }
  const { data: followupRows } = filterParts.length
    ? await supabaseAdmin
        .from("call_followups")
        .select("id, vapi_call_id, call_log_id, action, status, created_at, completed_at")
        .eq("tenant_id", tenant.id)
        .or(filterParts.join(","))
        .order("created_at", { ascending: true })
    : { data: [] };

  const followupsByKey = new Map<string, CallLog["followups"]>();
  const seenForKey = new Map<string, Set<string>>();
  for (const f of (followupRows ?? []) as Array<{
    id: string;
    vapi_call_id: string;
    call_log_id: string | null;
    action: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>) {
    // Index under whichever ids the row carries — vapi for live, call_log
    // for chat/backfill — so the lookup below succeeds regardless.
    const keys = [f.vapi_call_id, f.call_log_id].filter(Boolean) as string[];
    for (const key of keys) {
      const seen = seenForKey.get(key) ?? new Set<string>();
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      seenForKey.set(key, seen);

      const list = followupsByKey.get(key) ?? [];
      list.push({
        id: f.id,
        action: f.action,
        status: f.status as "pending" | "done",
        created_at: f.created_at,
        completed_at: f.completed_at,
      });
      followupsByKey.set(key, list);
    }
  }

  const calls: CallLog[] = callRows.map((c) => {
    const merged: CallLog["followups"] = [];
    const seen = new Set<string>();
    for (const list of [followupsByKey.get(c.vapi_call_id), followupsByKey.get(c.id)]) {
      if (!list) continue;
      for (const f of list) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        merged.push(f);
      }
    }
    return { ...c, followups: merged };
  });

  // Brand-prefixed link base for navigation to the detail page.
  const headerList = await headers();
  const xUrl = headerList.get("x-url") || "";
  const brandSlug = (() => {
    try {
      const u = new URL(xUrl);
      const seg = u.pathname.split("/").filter(Boolean)[0];
      return seg && seg !== "dashboard" ? seg : tenant.slug;
    } catch {
      return tenant.slug;
    }
  })();
  const brandPrefix = `/${brandSlug}`;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-zinc-900">Call Logs</h1>
      </div>

      {calls.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 text-center py-20">
          <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-zinc-700 mb-1">No calls yet</h3>
          <p className="text-sm text-zinc-400">
            Once your number is active, calls will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr className="bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Caller
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Summary
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Date &amp; Time
                </th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  brandPrefix={brandPrefix}
                  highlighted={call.id === highlightedCallId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
