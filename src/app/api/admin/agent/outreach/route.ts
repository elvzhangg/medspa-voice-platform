import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";

export const runtime = "nodejs";

const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL ?? "hello@vauxvoice.com";

export async function POST(req: NextRequest) {
  const { prospect_ids } = (await req.json()) as { prospect_ids: string[] };

  if (!prospect_ids?.length) {
    return NextResponse.json({ error: "prospect_ids required" }, { status: 400 });
  }

  // Fetch approved prospects with drafts; include owner_email so we can prefer it
  const { data: prospects, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("id, business_name, email, owner_email, email_draft_subject, email_draft_body, email_approved")
    .in("id", prospect_ids)
    .eq("email_approved", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!prospects?.length) {
    return NextResponse.json({ error: "No approved prospects found" }, { status: 400 });
  }

  const results: Array<{ id: string; business_name: string; status: string; error?: string; to?: string }> = [];
  const resendApiKey = process.env.RESEND_API_KEY;
  const now = new Date().toISOString();

  for (const prospect of prospects) {
    const recipient = prospect.owner_email ?? prospect.email;

    if (!recipient) {
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
          to: recipient,
          subject: prospect.email_draft_subject,
          text: prospect.email_draft_body,
        });

        await supabaseAdmin
          .from("outreach_prospects")
          .update({ status: "contacted", contacted_at: now, email_sent_at: now })
          .eq("id", prospect.id);

        await logProspectEvent({
          prospect_id: prospect.id,
          event_type: "email_sent",
          summary: `Sent to ${recipient}`,
          payload: { to: recipient, subject: prospect.email_draft_subject, via: "resend" },
          actor: "user",
        });

        results.push({ id: prospect.id, business_name: prospect.business_name, status: "sent", to: recipient });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: prospect.id, business_name: prospect.business_name, status: "error", error: msg, to: recipient });
      }
    } else {
      // No Resend key — mark contacted for local testing
      await supabaseAdmin
        .from("outreach_prospects")
        .update({ status: "contacted", contacted_at: now, email_sent_at: now })
        .eq("id", prospect.id);

      await logProspectEvent({
        prospect_id: prospect.id,
        event_type: "email_sent",
        summary: `Simulated send (no Resend key) to ${recipient}`,
        payload: { to: recipient, subject: prospect.email_draft_subject, via: "simulated" },
        actor: "user",
      });

      results.push({ id: prospect.id, business_name: prospect.business_name, status: "simulated", to: recipient });
    }
  }

  return NextResponse.json({ results });
}
