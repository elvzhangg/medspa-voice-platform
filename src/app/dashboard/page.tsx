import { getCurrentTenant } from"@/lib/supabase-server";
import { supabaseAdmin } from"@/lib/supabase";
import Link from"next/link";

interface CallLog {
 id: string;
 caller_number: string | null;
 duration_seconds: number | null;
 summary: string | null;
 created_at: string;
}

function formatDuration(seconds: number | null): string {
 if (!seconds) return"—";
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
 .select("*", { count:"exact", head: true })
 .eq("tenant_id", tenant.id),
 supabaseAdmin
 .from("call_logs")
 .select("*", { count:"exact", head: true })
 .eq("tenant_id", tenant.id),
 supabaseAdmin
 .from("call_logs")
 .select("*", { count:"exact", head: true })
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
 ?"Not assigned yet"
 : (tenant.phone_number ??"—");

 const kbCount = docCount ?? 0;
 const showChecklist = kbCount < 3;

 return (
 <div>
 {/* Page header */}
 <div className="mb-8">
 <h1 className="text-2xl font-semibold text-gray-900 mb-1">Overview</h1>
 <p className="text-sm text-gray-500">
 Here&apos;s how {tenant.name} is performing.
 </p>
 </div>

 {/* Stats */}
 <div className="grid grid-cols-4 gap-4 mb-8">
 <StatCard
 gradient="from-zinc-900 to-zinc-950"
 icon={
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
 </svg>
 }
 label="Handbook Docs"
 value={kbCount}
 sub="clinic handbook"
 />
 <StatCard
 gradient="from-zinc-700 to-zinc-900"
 icon={
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
 </svg>
 }
 label="Total Calls"
 value={totalCalls ?? 0}
 sub="all time"
 />
 <StatCard
 gradient="from-emerald-500 to-teal-600"
 icon={
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
 </svg>
 }
 label="Calls This Week"
 value={weekCalls ?? 0}
 sub="last 7 days"
 />
 <StatCard
 gradient="from-amber-400 to-amber-500"
 icon={
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
 </svg>
 }
 label="AI Phone Number"
 value={phoneDisplay}
 sub="receptionist line"
 small
 />
 </div>

 <div className="grid grid-cols-3 gap-6">
 {/* Recent Calls */}
 <div className="col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
 <h2 className="font-semibold text-gray-900 text-sm">Recent Calls</h2>
 <Link
 href="/dashboard/calls"
 className="text-xs text-amber-600 hover:text-amber-800 font-medium"
 >
 View all →
 </Link>
 </div>
 {!recentCalls || recentCalls.length === 0 ? (
 <div className="text-center py-14">
 <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
 <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
 </svg>
 </div>
 <p className="text-sm font-medium text-gray-600 mb-1">No calls yet</p>
 <p className="text-xs text-gray-400">Calls will appear here once your number is active.</p>
 </div>
 ) : (
 <div>
 {(recentCalls as CallLog[]).map((call, i) => (
 <div
 key={call.id}
 className={`flex items-center gap-4 px-6 py-3.5 ${i < recentCalls.length - 1 ?"border-b border-gray-50" :""}`}
 >
 <div className="w-8 h-8 bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-full flex items-center justify-center shrink-0">
 <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
 </svg>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold text-gray-900">
 {call.caller_number ||"Unknown caller"}
 </p>
 <p className="text-xs text-gray-400 truncate">
 {call.summary ||"No summary available"}
 </p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-xs font-medium text-gray-600 tabular-nums">
 {formatDuration(call.duration_seconds)}
 </p>
 <p className="text-xs text-gray-400">
 {new Date(call.created_at).toLocaleDateString("en-US", {
 month:"short",
 day:"numeric",
 })}
 </p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Right column */}
 <div className="space-y-4">
 {/* Quick Actions */}
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
 <div className="space-y-2">
 <Link
 href="/dashboard/knowledge-base"
 className="flex items-center gap-2.5 w-full px-3.5 py-2.5 bg-zinc-950 text-white rounded-lg text-sm font-semibold hover:bg-zinc-900 transition-all shadow-sm"
 >
 <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
 </svg>
 Add Handbook Doc
 </Link>
 <Link
 href="/dashboard/calls"
 className="flex items-center gap-2.5 w-full px-3.5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
 >
 <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
 </svg>
 View All Calls
 </Link>
 <Link
 href="/dashboard/settings"
 className="flex items-center gap-2.5 w-full px-3.5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
 >
 <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
 </svg>
 Clinic Setup
 </Link>
 </div>
 </div>

 {/* Getting Started Checklist */}
 {showChecklist && (
 <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
 <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100">
 <h2 className="font-semibold text-amber-900 text-sm flex items-center gap-1.5">
 <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
 </svg>
 Getting Started
 </h2>
 </div>
 <div className="px-5 py-4 space-y-3">
 <ChecklistItem
 done={kbCount >= 1}
 label="Add your first handbook doc"
 href="/dashboard/knowledge-base"
 />
 <ChecklistItem
 done={kbCount >= 2}
 label="Add a second document"
 href="/dashboard/knowledge-base"
 />
 <ChecklistItem
 done={kbCount >= 3}
 label="Add 3+ docs for best AI quality"
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
 gradient,
 icon,
 label,
 value,
 sub,
 small,
}: {
 gradient: string;
 icon: React.ReactNode;
 label: string;
 value: string | number;
 sub?: string;
 small?: boolean;
}) {
 return (
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all">
 <div className={`h-1 bg-gradient-to-r ${gradient}`} />
 <div className="p-5">
 <div className={`w-9 h-9 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center mb-3 text-white`}>
 {icon}
 </div>
 <p className={`font-bold text-gray-900 mb-0.5 ${small ?"text-base" :"text-2xl"}`}>
 {value}
 </p>
 <p className="text-xs font-semibold text-gray-500">{label}</p>
 {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
 </div>
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
 <Link href={href} className="flex items-center gap-2.5 group">
 <span
 className={`flex-shrink-0 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center
 ${done ?"bg-emerald-500 border-emerald-500" :"border-gray-300 group-hover:border-amber-400"}`}
 >
 {done && (
 <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
 </svg>
 )}
 </span>
 <span
 className={`text-sm leading-snug ${
 done ?"text-gray-400 line-through" :"text-gray-700 group-hover:text-amber-800"
 }`}
 >
 {label}
 </span>
 </Link>
 );
}
