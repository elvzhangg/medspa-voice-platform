import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type, channel, message, subject, scheduled_at, contacts } = body;

  if (!name || !message) {
    return NextResponse.json({ error: "name and message are required" }, { status: 400 });
  }

  const status = scheduled_at ? "scheduled" : "draft";

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .insert({
      tenant_id: tenant.id,
      name,
      type: type || "reminder",
      channel: channel || "sms",
      status,
      message,
      subject: subject || null,
      scheduled_at: scheduled_at || null,
      total_contacts: 0,
      sent_count: 0,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  // Parse and insert contacts if provided
  if (contacts && contacts.trim()) {
    const lines = (contacts as string)
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const contactRows = lines.map((line: string) => {
      const parts = line.split(",").map((p: string) => p.trim());
      const contactName = parts.length > 1 ? parts[0] : null;
      const contactValue = parts.length > 1 ? parts[1] : parts[0];
      const isEmail = contactValue.includes("@");
      return {
        campaign_id: campaign.id,
        tenant_id: tenant.id,
        name: contactName,
        phone: isEmail ? null : contactValue,
        email: isEmail ? contactValue : null,
        status: "pending",
      };
    });

    if (contactRows.length > 0) {
      await supabaseAdmin.from("campaign_contacts").insert(contactRows);
      await supabaseAdmin
        .from("campaigns")
        .update({ total_contacts: contactRows.length })
        .eq("id", campaign.id);
    }
  }

  return NextResponse.json({ campaign }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("campaigns")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenant_id !== tenant.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin
    .from("campaigns")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("campaigns")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenant_id !== tenant.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  return NextResponse.json({ success: true });
}
