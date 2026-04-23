import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";
import FollowupCoPilot from "./FollowupCoPilot";

type PageProps = { params: Promise<{ id: string }> };

// Follow-up Co-Pilot — the full-page collaborative drafting surface for
// winning back a caller who didn't book. Server component loads the call
// context + caller profile once, then hands off to the client component
// for the iterative chat + send flow.
export default async function FollowupPage({ params }: PageProps) {
  const { id } = await params;
  const tenant = (await getCurrentTenant()) as {
    id: string;
    slug: string;
    name: string;
  } | null;
  if (!tenant) return null;

  const { data: call } = await supabaseAdmin
    .from("call_logs")
    .select("id, caller_number, duration_seconds, summary, transcript, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!call) notFound();

  // Caller profile for pre-populating what we already know. Graceful when
  // we've never met this number before.
  type CallerProfile = {
    first_name: string | null;
    last_name: string | null;
    last_service: string | null;
    total_calls: number | null;
  };
  let callerProfile: CallerProfile | null = null;
  if (call.caller_number) {
    const { data: profile } = await supabaseAdmin
      .from("client_profiles")
      .select("first_name, last_name, last_service, total_calls")
      .eq("tenant_id", tenant.id)
      .eq("phone", call.caller_number)
      .maybeSingle();
    callerProfile = profile as CallerProfile | null;
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <Link
          href={`/${tenant.slug}/dashboard`}
          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← Overview
        </Link>
        <h1 className="font-serif text-3xl text-zinc-900 mt-2">Follow-up co-pilot</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Work with Vivienne to draft a personalized SMS for this caller. She'll use the call
          transcript and what you tell her to write something warm and specific.
        </p>
      </div>

      <FollowupCoPilot
        callId={call.id}
        callerPhone={call.caller_number ?? ""}
        callerName={
          callerProfile?.first_name
            ? `${callerProfile.first_name}${callerProfile.last_name ? " " + callerProfile.last_name : ""}`
            : ""
        }
        callerTotalCalls={callerProfile?.total_calls ?? null}
        callSummary={call.summary ?? ""}
        callDurationSeconds={call.duration_seconds ?? null}
        callCreatedAt={call.created_at}
      />
    </div>
  );
}
