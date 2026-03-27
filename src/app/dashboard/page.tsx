import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export default async function DashboardPage() {
  const tenant = await getCurrentTenant() as { id: string; name: string; phone_number: string } | null;
  if (!tenant) return null;

  // Fetch quick stats
  const [{ count: docCount }, { count: callCount }] = await Promise.all([
    supabaseAdmin
      .from("knowledge_base_documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabaseAdmin
      .from("call_logs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Welcome back 👋
      </h1>
      <p className="text-gray-500 mb-8">Here&apos;s how {tenant.name} is doing.</p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label="KB Documents" value={docCount ?? 0} />
        <StatCard label="Total Calls" value={callCount ?? 0} />
        <StatCard label="Phone Number" value={tenant.phone_number} />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex gap-3">
          <a
            href="/dashboard/knowledge-base"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            + Add Knowledge Base Doc
          </a>
          <a
            href="/dashboard/calls"
            className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            View Call Logs
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
