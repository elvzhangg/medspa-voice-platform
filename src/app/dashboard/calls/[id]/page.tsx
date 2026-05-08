import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import CallDetailView, { type CallDetailFollowup } from "./CallDetailView";

type PageProps = { params: Promise<{ id: string }> };

// Single-call deep-dive: transcript on the left, Ask Vivienne chat on the
// right, tasks pinned above the chat. Replaces the expand-in-place row in
// the calls table for anything beyond a quick scan.
export default async function CallDetailPage({ params }: PageProps) {
  const { id } = await params;
  const tenant = (await getCurrentTenant()) as {
    id: string;
    slug: string;
    name: string;
  } | null;
  if (!tenant) return null;

  const { data: call } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, duration_seconds, summary, transcript, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!call) notFound();

  // Followups linked either directly (call_log_id, newer rows) or via the
  // vapi call id (older live-call rows that pre-date the column).
  const { data: followupRows } = await supabaseAdmin
    .from("call_followups")
    .select("id, action, status, source, created_at, completed_at")
    .eq("tenant_id", tenant.id)
    .or(
      `call_log_id.eq.${call.id}${call.vapi_call_id ? `,vapi_call_id.eq.${call.vapi_call_id}` : ""}`
    )
    .order("created_at", { ascending: true });

  const followups: CallDetailFollowup[] = ((followupRows ?? []) as Array<{
    id: string;
    action: string;
    status: "pending" | "done";
    source: "live" | "chat" | "backfill" | "manual";
    created_at: string;
    completed_at: string | null;
  }>).map((f) => ({ ...f }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/${tenant.slug}/dashboard/calls`}
          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← All calls
        </Link>
        <h1 className="font-serif text-3xl text-zinc-900 mt-2">Call detail</h1>
      </div>

      <CallDetailView
        callId={call.id}
        callerPhone={call.caller_number}
        callDurationSeconds={call.duration_seconds}
        callSummary={call.summary}
        callTranscript={call.transcript}
        callCreatedAt={call.created_at}
        initialFollowups={followups}
      />
    </div>
  );
}
