import { supabaseAdmin } from "./supabase";

interface ProspectProvider {
  name?: string;
  title?: string;
  specialties?: string[];
  bio?: string;
}

/**
 * Insert a staff row per researched provider so the assistant's provider
 * roster prompt block is non-empty and the AI can introduce the team
 * instead of punting to "have someone reach out". Best-effort — bad rows
 * are skipped and don't fail the whole flow. Idempotent: skips inserts
 * for names that already exist on the tenant (case-insensitive).
 *
 * Shared by both the CRM activation flow and the demo-provisioner so
 * every tenant lands with the same staff-seeded experience.
 */
export async function seedStaffFromProviders(
  tenantId: string,
  providers: unknown
): Promise<{ inserted: number; skipped: number }> {
  if (!Array.isArray(providers)) return { inserted: 0, skipped: 0 };

  const { data: existing } = await supabaseAdmin
    .from("staff")
    .select("name")
    .eq("tenant_id", tenantId);
  const have = new Set(
    (existing ?? []).map((r) => String(r.name ?? "").toLowerCase().trim())
  );

  let inserted = 0;
  let skipped = 0;
  for (const raw of providers as ProspectProvider[]) {
    const name = raw?.name?.trim();
    if (!name || have.has(name.toLowerCase())) { skipped += 1; continue; }

    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      name,
      title: raw.title?.trim() || null,
      specialties: Array.isArray(raw.specialties) ? raw.specialties.filter(Boolean) : [],
      bio: raw.bio?.trim() || null,
      active: true,
    };
    const { error } = await supabaseAdmin.from("staff").insert(row);
    if (error) {
      // Column may be missing on older schemas — retry with minimal fields.
      const { error: e2 } = await supabaseAdmin.from("staff").insert({
        tenant_id: tenantId,
        name,
        title: row.title,
      });
      if (e2) { skipped += 1; continue; }
    }
    inserted += 1;
    have.add(name.toLowerCase());
  }
  return { inserted, skipped };
}
