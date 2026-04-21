import { getCurrentTenant } from"@/lib/supabase-server";
import { supabaseAdmin } from"@/lib/supabase";
import CallRow, { type CallLog } from"./CallRow";

export default async function CallLogsPage() {
 const tenant = (await getCurrentTenant()) as { id: string } | null;
 if (!tenant) return null;

 const { data } = await supabaseAdmin
 .from("call_logs")
 .select("id, caller_number, duration_seconds, summary, transcript, created_at")
 .eq("tenant_id", tenant.id)
 .order("created_at", { ascending: false })
 .limit(100);

 const calls: CallLog[] = data ?? [];

 return (
 <div>
 <div className="mb-8">
 <h1 className="text-2xl font-semibold text-gray-900 mb-1">Call Logs</h1>
 <p className="text-sm text-gray-500">Recent calls handled by your AI receptionist</p>
 </div>

 {calls.length === 0 ? (
 <div className="bg-white rounded-xl border border-gray-200 text-center py-20">
 <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
 <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
 </svg>
 </div>
 <h3 className="text-base font-semibold text-gray-700 mb-1">No calls yet</h3>
 <p className="text-sm text-gray-400">
 Once your number is active, calls will appear here.
 </p>
 </div>
 ) : (
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full text-sm">
 <thead className="border-b border-gray-100">
 <tr className="bg-gray-50">
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
 Caller
 </th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
 Duration
 </th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
 Summary
 </th>
 <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
 Date &amp; Time
 </th>
 <th className="px-5 py-3 w-8" />
 </tr>
 </thead>
 <tbody>
 {calls.map((call) => (
 <CallRow key={call.id} call={call} />
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 );
}
