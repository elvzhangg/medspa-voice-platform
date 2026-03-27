import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export default async function CallLogsPage() {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return null;

  const { data: calls } = await supabaseAdmin
    .from("call_logs")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Call Logs</h1>
      <p className="text-gray-500 mb-8">Recent calls handled by your AI receptionist</p>

      {!calls || calls.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📞</p>
          <p>No calls yet. Once your number is active, calls will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Caller</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Duration</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Summary</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{call.caller_number || "Unknown"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {call.duration_seconds ? `${Math.round(call.duration_seconds / 60)}m` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {call.summary || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(call.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
