import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL ?? "hello@vauxvoice.com";

export async function POST(req: NextRequest) {
  const { prospect_ids } = await req.json() as { prospect_ids: string[] };

  if (!prospect_ids?.length) {
    return NextResponse.json({ error: "prospect_ids required" }, { status: 400 });
  }

  // Fetch approved prospects with email drafts
  const { data: prospects, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("id, business_name, email, email_draft_subject, email_draft_body, email_approved")
    .in("id", prospect_ids)
    .eq("email_approved", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!prospects?.length) {
    return NextResponse.json({ error: "No approved prospects found" }, { status: 400 });
  }

  const results: Array<{ id: string; business_name: string; status: string; error?: string }> = [];

  const resendApiKey = process.env.RESEND_API_KEY;

  for (const prospect of prospects) {
    if (!prospect.email) {
      results.push({ id: prospect.id, business_name: prospect.business_name, status: "skipped", error: "No email address" });
      continue;
    }

    if (!prospect.email_draft_subject || !prospect.email_draft_body) {
      results.push({ id: prospect.id, business_name: prospect.business_name, status: "skipped", error: "No email draft" });
      continue;
    }

    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: FROM_EMAIL,
          to: prospect.email,
          subject: prospect.email_draft_subject,
          text: prospect.email_draft_body,
        });

        await supabaseAdmin
          .from("outreach_prospects")
          .update({ status: "contacted", contacted_at: new Date().toISOString() })
          .eq("id", prospect.id);

        results.push({ id: prospect.id, business_name: prospect.business_name, status: "sent" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: prospect.id, business_name: prospect.business_name, status: "error", error: msg });
      }
    } else {
      // No Resend key configured — mark as contacted anyway (useful for testing)
      await supabaseAdmin
        .from("outreach_prospects")
        .update({ status: "contacted", contacted_at: new Date().toISOString() })
        .eq("id", prospect.id);

      results.push({ id: prospect.id, business_name: prospect.business_name, status: "simulated" });
    }
  }

  return NextResponse.json({ results });
}
