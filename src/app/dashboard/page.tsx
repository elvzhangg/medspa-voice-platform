import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

interface CallLog {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default async function DashboardPage() {
  const tenant = await getCurrentTenant() as {
    id: string;
    name: string;
    phone_number: string;
  } | null;
  if (!tenant) return null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: docCount },
    { count: totalCalls },
    { count: weekCalls },
    { data: recentCalls },
  ] = await Promise.all([
    supabaseAdmin
      .from("knowledge_base_documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabaseAdmin
      .from("call_logs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabaseAdmin
      .from("call_logs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", weekAgo),
    supabaseAdmin
      .from("call_logs")
      .select("id, caller_number, duration_seconds, summary, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const phoneDisplay = tenant.phone_number?.startsWith("pending-")
    ? "Not assigned yet"
    : (tenant.phone_number ?? "—");

  const kbCount = docCount ?? 0;
  const showChecklist = kbCount < 3;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back 👋</h1>
      <p className="text-gray-500 mb-8 text-sm">Here&apos;s how {tenant.name} is doing.</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard
          icon="📚"
          label="KB Documents"
          value={kbCount}
          sub="knowledge docs"
        />
        <StatCard
          icon="📞"
          label="Total Calls"
          value={totalCalls ?? 0}
          sub="all time"
        />
        <StatCard
          icon="📅"
          label="Calls This Week"
          value={weekCalls ?? 0}
          sub="last 7 days"
        />
        <StatCard
          icon="☎️"
          label="Phone Number"
          value={phoneDisplay}
          sub="AI receptionist"
          small
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent Calls */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Calls</h2>
            <Link
              href="/dashboard/calls"
              className="text-xs text-indigo-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          {!recentCalls || recentCalls.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📞</p>
              <p className="text-sm text-gray-400">No calls yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(recentCalls as CallLog[]).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-xs">
                      📞
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {call.caller_number || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-400 line-clamp-1">
                        {call.summary || "No summary"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{formatDuration(call.duration_seconds)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(call.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/dashboard/knowledge-base"
                className="flex items-center gap-2 w-full px-3 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <span>📝</span> Add KB Document
              </Link>
              <Link
                href="/dashboard/calls"
                className="flex items-center gap-2 w-full px-3 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <span>📊</span> View All Calls
              </Link>
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-2 w-full px-3 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <span>⚙️</span> Settings
              </Link>
            </div>
          </div>

          {/* Getting Started Checklist */}
          {showChecklist && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
              <h2 className="font-semibold text-amber-900 mb-3 flex items-center gap-1.5">
                <span>🚀</span> Getting Started
              </h2>
              <div className="space-y-2.5">
                <ChecklistItem
                  done={kbCount >= 1}
                  label="Add your first KB document"
                  href="/dashboard/knowledge-base"
                />
                <ChecklistItem
                  done={kbCount >= 2}
                  label="Add a second document"
                  href="/dashboard/knowledge-base"
                />
                <ChecklistItem
                  done={kbCount >= 3}
                  label="Add 3+ documents for best AI quality"
                  href="/dashboard/knowledge-base"
                />
                <ChecklistItem
                  done={!tenant.phone_number?.startsWith("pending-")}
                  label="Phone number assigned"
                  href="/dashboard/settings"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  small,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  small?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`font-bold text-gray-900 ${small ? "text-base" : "text-2xl"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2 group">
      <span className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-xs
        ${done ? "bg-green-500 border-green-500 text-white" : "border-amber-400"}`}>
        {done ? "✓" : ""}
      </span>
      <span className={`text-sm ${done ? "text-gray-400 line-through" : "text-amber-800 group-hover:underline"}`}>
        {label}
      </span>
    </Link>
  );
}
