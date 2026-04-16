import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const [
    { count: totalTenants },
    { count: totalDemoRequests },
    { count: newDemoRequests },
    { count: totalKbDocs },
    { count: totalCalls },
    { data: recentDemoRequests },
    { data: recentTenants },
  ] = await Promise.all([
    supabaseAdmin.from("tenants").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("demo_requests").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("demo_requests").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabaseAdmin.from("knowledge_base_documents").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("call_logs").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("demo_requests")
      .select("id, name, email, business_name, phone, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("tenants")
      .select("id, name, slug, phone_number, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    totalTenants: totalTenants ?? 0,
    totalDemoRequests: totalDemoRequests ?? 0,
    newDemoRequests: newDemoRequests ?? 0,
    totalKbDocs: totalKbDocs ?? 0,
    totalCalls: totalCalls ?? 0,
    recentDemoRequests: recentDemoRequests ?? [],
    recentTenants: recentTenants ?? [],
  });
}
