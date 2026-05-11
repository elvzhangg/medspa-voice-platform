// Builds RAG knowledge-base chunks from a prospect record (CRM or outreach).
// Extracted from demo-provisioner.ts so the CRM activation wizard can show
// the user the chunks BEFORE they're embedded + inserted.

interface Procedure { name: string; description?: string; duration_min?: number; price?: string | number; notes?: string }
interface Provider { name: string; title?: string; specialties?: string[]; bio?: string }
interface HoursValue { open?: string; close?: string }

export type Category = "services" | "pricing" | "policies" | "faq" | "general";

export interface KbChunk {
  title: string;
  content: string;
  category: Category;
}

export function buildKnowledgeChunks(p: Record<string, unknown>): KbChunk[] {
  const chunks: KbChunk[] = [];

  const overview: string[] = [];
  overview.push(`Business name: ${p.business_name}`);
  if (p.address) overview.push(`Address: ${p.address}`);
  if (p.city || p.state) overview.push(`Location: ${[p.city, p.state].filter(Boolean).join(", ")}`);
  if (p.phone) overview.push(`Main phone: ${p.phone}`);
  if (p.website) overview.push(`Website: ${p.website}`);
  if (p.services_summary) overview.push(`Overview: ${p.services_summary}`);
  if (overview.length > 1) {
    chunks.push({ title: "Business overview", content: overview.join("\n"), category: "general" });
  }

  if (p.business_hours && typeof p.business_hours === "object") {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const lines: string[] = [];
    for (const day of days) {
      const val = (p.business_hours as Record<string, HoursValue | string>)[day];
      if (val == null) continue;
      const display = typeof val === "string" ? val : val.open && val.close ? `${val.open}–${val.close}` : "";
      if (display) lines.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${display}`);
    }
    if (lines.length) {
      chunks.push({ title: "Hours of operation", content: lines.join("\n"), category: "policies" });
    }
  }

  if (p.directions_parking_info && String(p.directions_parking_info).trim()) {
    chunks.push({
      title: "Parking and directions",
      content: String(p.directions_parking_info),
      category: "policies",
    });
  }

  if (p.booking_config && typeof p.booking_config === "object") {
    const bc = p.booking_config as Record<string, unknown>;
    if (bc.cancellation_policy) {
      chunks.push({ title: "Cancellation policy", content: String(bc.cancellation_policy), category: "policies" });
    }
    if (bc.deposit_policy || bc.deposit_amount_display) {
      const lines: string[] = [];
      if (bc.deposit_policy) lines.push(String(bc.deposit_policy));
      if (bc.deposit_amount_display) lines.push(`Amount: ${bc.deposit_amount_display}`);
      chunks.push({ title: "Deposit policy", content: lines.join("\n"), category: "policies" });
    }
    if (bc.late_policy) {
      chunks.push({ title: "Late arrival policy", content: String(bc.late_policy), category: "policies" });
    }
    if (Array.isArray(bc.payment_methods) && bc.payment_methods.length) {
      chunks.push({
        title: "Payment methods accepted",
        content: `We accept: ${(bc.payment_methods as string[]).join(", ")}`,
        category: "faq",
      });
    }
    if (Array.isArray(bc.financing_options) && bc.financing_options.length) {
      chunks.push({
        title: "Financing options",
        content: `We offer financing through: ${(bc.financing_options as string[]).join(", ")}`,
        category: "pricing",
      });
    }
    if (bc.membership_program) {
      chunks.push({ title: "Membership program", content: String(bc.membership_program), category: "pricing" });
    }
  }

  if (Array.isArray(p.faqs)) {
    for (const faq of p.faqs as Array<{ question?: string; answer?: string }>) {
      if (!faq?.question || !faq?.answer) continue;
      chunks.push({
        title: `FAQ — ${faq.question.slice(0, 60)}`,
        content: `Q: ${faq.question}\nA: ${faq.answer}`,
        category: "faq",
      });
    }
  }

  if (Array.isArray(p.procedures)) {
    for (const proc of p.procedures as Procedure[]) {
      if (!proc?.name) continue;
      const lines: string[] = [`Service: ${proc.name}`];
      if (proc.description) lines.push(proc.description);
      if (proc.duration_min != null) lines.push(`Typical duration: ${proc.duration_min} minutes`);
      if (proc.price != null && String(proc.price).trim() !== "") lines.push(`Price: ${proc.price}`);
      if (proc.notes) lines.push(`Notes: ${proc.notes}`);
      chunks.push({
        title: `Procedure — ${proc.name}`,
        content: lines.join("\n"),
        category: proc.price != null ? "pricing" : "services",
      });
    }
  }

  if (Array.isArray(p.providers) && (p.providers as Provider[]).length) {
    const lines: string[] = [];
    for (const prov of p.providers as Provider[]) {
      if (!prov?.name) continue;
      const bits: string[] = [prov.name];
      if (prov.title) bits.push(prov.title);
      if (prov.specialties && prov.specialties.length) bits.push(`specialties: ${prov.specialties.join(", ")}`);
      lines.push(bits.join(" — "));
      if (prov.bio) lines.push(`  ${prov.bio}`);
    }
    chunks.push({ title: "Providers and staff", content: lines.join("\n"), category: "general" });
  }

  if (p.pricing_notes && !chunks.some((c) => c.category === "pricing")) {
    chunks.push({ title: "Pricing notes", content: String(p.pricing_notes), category: "pricing" });
  }

  return chunks;
}
