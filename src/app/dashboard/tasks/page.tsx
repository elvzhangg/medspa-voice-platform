import { headers } from "next/headers";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import TasksList, { type TaskRow } from "./TasksList";

type SearchParams = Promise<{ status?: string; source?: string }>;

// Tasks lives on its own page so staff can see every pending follow-up at
// a glance, instead of expanding each row in the call log. Tasks come
// from four sources: live calls (Vivienne logged it during the call),
// chat (added via Ask Vivienne on the call detail page), backfill (one-
// shot extraction over historical transcripts), or manual.
export default async function TasksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const tenant = (await getCurrentTenant()) as { id: string; slug: string } | null;
  if (!tenant) return null;

  const sp = await searchParams;
  const statusFilter = sp.status === "done" ? "done" : sp.status === "all" ? "all" : "pending";
  const sourceFilter =
    sp.source === "live" || sp.source === "chat" || sp.source === "backfill" || sp.source === "manual"
      ? sp.source
      : "all";

  let query = supabaseAdmin
    .from("call_followups")
    .select(
      "id, vapi_call_id, customer_phone, customer_name, action, status, source, created_at, completed_at, call_log_id"
    )
    .eq("tenant_id", tenant.id)
    .order("status", { ascending: true }) // pending first
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (sourceFilter !== "all") query = query.eq("source", sourceFilter);

  const { data: rawTasks } = await query;
  const tasks = (rawTasks ?? []) as Array<{
    id: string;
    vapi_call_id: string;
    customer_phone: string | null;
    customer_name: string | null;
    action: string;
    status: "pending" | "done";
    source: "live" | "chat" | "backfill" | "manual";
    created_at: string;
    completed_at: string | null;
    call_log_id: string | null;
  }>;

  // Resolve call_log_id for any rows that only carry vapi_call_id (live
  // calls insert with vapi_call_id and leave call_log_id null). We do this
  // in one batched lookup so deep-links to /calls/[id] work for old rows.
  const missingIds = tasks
    .filter((t) => !t.call_log_id && t.vapi_call_id)
    .map((t) => t.vapi_call_id);
  const vapiToCallLog = new Map<string, string>();
  if (missingIds.length) {
    const { data: callRows } = await supabaseAdmin
      .from("call_logs")
      .select("id, vapi_call_id")
      .eq("tenant_id", tenant.id)
      .in("vapi_call_id", missingIds);
    for (const row of (callRows ?? []) as Array<{ id: string; vapi_call_id: string }>) {
      vapiToCallLog.set(row.vapi_call_id, row.id);
    }
  }

  const enriched: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    action: t.action,
    status: t.status,
    source: t.source,
    customer_name: t.customer_name,
    customer_phone: t.customer_phone,
    created_at: t.created_at,
    completed_at: t.completed_at,
    call_log_id: t.call_log_id ?? vapiToCallLog.get(t.vapi_call_id) ?? null,
  }));

  // Brand-prefixed link base — call deep-links need to resolve to the
  // public URL, not the internal /dashboard/* path the middleware rewrites
  // to (Link won't pass through the brand segment otherwise).
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

  const pendingCount = enriched.filter((t) => t.status === "pending").length;
  const doneCount = enriched.filter((t) => t.status === "done").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-zinc-900">Tasks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Follow-ups Vivienne committed to during calls — plus anything you&rsquo;ve added from
          a transcript chat.
        </p>
      </div>

      <TasksList
        tasks={enriched}
        brandPrefix={brandPrefix}
        statusFilter={statusFilter}
        sourceFilter={sourceFilter}
        pendingCount={pendingCount}
        doneCount={doneCount}
      />
    </div>
  );
}
