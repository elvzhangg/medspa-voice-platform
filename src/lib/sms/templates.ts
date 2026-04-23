// Fixed SMS templates. NOT tenant-customizable on purpose: keeping the wording
// vetted in code is how we stay HIPAA-defensible (minimum-necessary framing,
// no PHI leakage in the SMS envelope) and TCPA-defensible (consistent STOP
// language). Tenants only author the per-treatment {Guideline} body, which
// is interpolated into the followup wrapper.
//
// Tokens (curly-brace style; the legacy [Bracket] style is deprecated):
//   {Customer}, {Clinic}, {Date}, {Time}, {Guideline}

export type SmsTemplateType = "confirmation" | "reminder" | "followup";

export const SMS_TEMPLATES = {
  confirmation:
    "Hi {Customer}! Your appointment at {Clinic} is confirmed for {Date} at {Time}. Reply STOP to opt out.",

  reminder:
    "Reminder: You have an appointment at {Clinic} on {Date} at {Time}. Reply C to confirm or call us to reschedule. Reply STOP to opt out.",

  // Followup wrapper. {Guideline} is the per-treatment body authored by the
  // tenant in post_procedure_templates.guideline_text. Notably we do NOT
  // name the procedure in the envelope — minimum necessary.
  followupWrapper:
    "Hi {Customer}, thank you for visiting {Clinic}. Here are your aftercare instructions:\n\n{Guideline}\n\nQuestions? Reply to this message. Reply STOP to opt out.",
} as const;

interface RenderVars {
  Customer?: string;
  Clinic?: string;
  Date?: string;
  Time?: string;
  Guideline?: string;
}

export function renderTemplate(template: string, vars: RenderVars): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: keyof RenderVars) => {
    return vars[key] ?? "";
  });
}
