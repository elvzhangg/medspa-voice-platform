import { supabaseAdmin } from "./supabase";

export type ProspectEventType =
  | "researched"
  | "demo_provisioned"
  | "demo_released"
  | "email_drafted"
  | "email_sent"
  | "email_opened"
  | "email_replied"
  | "demo_called"
  | "status_changed"
  | "note_added";

export async function logProspectEvent(params: {
  prospect_id: string;
  event_type: ProspectEventType;
  summary?: string;
  payload?: Record<string, unknown>;
  actor?: string;
}): Promise<void> {
  const { prospect_id, event_type, summary, payload, actor } = params;
  await supabaseAdmin.from("outreach_prospect_events").insert({
    prospect_id,
    event_type,
    summary: summary ?? null,
    payload: payload ?? null,
    actor: actor ?? "system",
  });
}
