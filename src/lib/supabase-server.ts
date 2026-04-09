import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function getSession() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentTenant() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const headerList = await headers();
  const fullUrl = headerList.get("x-url") || "";
  
  // Robust slug extraction from URL path
  let slugFromUrl = null;
  const parts = new URL(fullUrl || "http://localhost").pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[1] === "dashboard") {
    slugFromUrl = parts[0];
  }

  const { data } = await supabase
    .from("tenant_users")
    .select("tenant_id, role, tenants(*)")
    .eq("user_id", session.user.id);

  if (!data || data.length === 0) return null;

  if (slugFromUrl) {
    const matched = data.find(tu => (tu.tenants as any).slug === slugFromUrl);
    if (matched) return { ...(matched.tenants as object), role: matched.role };
  }

  // FALLBACK: If no slug matches or no slug provided, return the first tenant they have access to
  return { ...(data[0].tenants as object), role: data[0].role };
}
