import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/admin/list-users
//
// One-shot lookup for "which email did I use to sign up?". Lists every auth
// user along with the tenants they belong to. No passwords — emails + role
// only. Gated by the same admin password the rest of /admin uses (the page
// guards it; this endpoint is open behind that gate).
export async function GET() {
  // Pull all auth users (service role can do this).
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  const users = authData?.users ?? [];

  // Pull tenant memberships joined to tenant names.
  const { data: memberships } = await supabaseAdmin
    .from("tenant_users")
    .select("user_id, role, tenants(name, slug)");

  const byUser = new Map<string, Array<{ tenant: string; slug: string; role: string }>>();
  for (const m of memberships ?? []) {
    const t = m.tenants as { name?: string; slug?: string } | null;
    const list = byUser.get(m.user_id) ?? [];
    list.push({ tenant: t?.name ?? "?", slug: t?.slug ?? "?", role: m.role });
    byUser.set(m.user_id, list);
  }

  const rows = users
    .map((u) => ({
      email: u.email ?? null,
      last_sign_in_at: u.last_sign_in_at,
      created_at: u.created_at,
      tenants: byUser.get(u.id) ?? [],
    }))
    .sort((a, b) => {
      const aT = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const bT = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return bT - aT;
    });

  return NextResponse.json({ count: rows.length, users: rows });
}
