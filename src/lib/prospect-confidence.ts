// Computes a deterministic confidence score (0.0–1.0) from which prospect fields
// are actually populated. Replaces the LLM's self-reported confidence, which drifts
// and overestimates.
//
// Weighting reflects what actually drives demo quality: owner contact (outreach
// deliverability) + procedure pricing + rich policy/FAQ/hours data (voice-agent
// answer quality).

interface ProcedureLike {
  name?: string;
  price?: string | number;
}
interface ProviderLike {
  name?: string;
}
interface SourceLike {
  url?: string;
}
interface FaqLike {
  question?: string;
  answer?: string;
}

interface ProspectLike {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  address?: string | null;
  procedures?: ProcedureLike[] | null;
  providers?: ProviderLike[] | null;
  business_hours?: Record<string, unknown> | null;
  research_sources?: SourceLike[] | null;
  directions_parking_info?: string | null;
  booking_config?: Record<string, unknown> | null;
  faqs?: FaqLike[] | null;
}

export interface ConfidenceBreakdown {
  score: number;                 // 0.0–1.0
  total_points: number;          // raw points earned (max 100)
  missing: string[];             // human-readable list of gaps
  strengths: string[];           // what's present
}

export function computeConfidence(p: ProspectLike): ConfidenceBreakdown {
  let points = 0;
  const missing: string[] = [];
  const strengths: string[] = [];

  // Basic contact (25 pts)
  if (p.website && p.website.trim()) { points += 8; strengths.push("website"); } else missing.push("website");
  if (p.phone && p.phone.trim()) { points += 8; strengths.push("phone"); } else missing.push("phone");
  if (p.email && p.email.trim()) { points += 4; strengths.push("general email"); } else missing.push("general email");
  if (p.address && p.address.trim()) { points += 5; strengths.push("address"); } else missing.push("address");

  // Owner contact — outreach deliverability (18 pts)
  if (p.owner_name && p.owner_name.trim()) { points += 5; strengths.push("owner name"); } else missing.push("owner name");
  if (p.owner_email && p.owner_email.trim()) { points += 13; strengths.push("owner email"); } else missing.push("owner email");

  // Procedures — what the voice agent will be asked about most (22 pts)
  const procedures = Array.isArray(p.procedures) ? p.procedures.filter((x) => x?.name) : [];
  if (procedures.length >= 3) { points += 8; strengths.push(`${procedures.length} procedures`); }
  else if (procedures.length > 0) { points += 4; strengths.push(`${procedures.length} procedures`); }
  else missing.push("procedures");

  const procsWithPrice = procedures.filter((x) => x.price != null && String(x.price).trim() !== "");
  if (procsWithPrice.length >= 3) { points += 14; strengths.push(`${procsWithPrice.length} procedures with prices`); }
  else if (procsWithPrice.length > 0) { points += 7; strengths.push(`${procsWithPrice.length} procedure prices`); }
  else missing.push("procedure pricing");

  // Providers (8 pts)
  const providers = Array.isArray(p.providers) ? p.providers.filter((x) => x?.name) : [];
  if (providers.length > 0) { points += 8; strengths.push(`${providers.length} providers`); }
  else missing.push("providers");

  // Business hours (8 pts)
  if (p.business_hours && typeof p.business_hours === "object" && Object.keys(p.business_hours).length >= 5) {
    points += 8;
    strengths.push("hours");
  } else {
    missing.push("hours");
  }

  // Policy/payment coverage — makes the demo sound like a real receptionist (14 pts)
  const bc = p.booking_config ?? {};
  const hasCancellation = typeof bc === "object" && bc !== null && Boolean((bc as Record<string, unknown>).cancellation_policy);
  const hasDeposit = typeof bc === "object" && bc !== null && Boolean((bc as Record<string, unknown>).deposit_policy);
  const hasPayment = typeof bc === "object" && bc !== null && Array.isArray((bc as Record<string, unknown>).payment_methods) && ((bc as { payment_methods?: unknown[] }).payment_methods?.length ?? 0) > 0;
  if (hasCancellation) { points += 5; strengths.push("cancellation policy"); } else missing.push("cancellation policy");
  if (hasDeposit) { points += 4; strengths.push("deposit policy"); } else missing.push("deposit policy");
  if (hasPayment) { points += 5; strengths.push("payment methods"); } else missing.push("payment methods");

  // Parking/directions (2 pts — small but common call question)
  if (p.directions_parking_info && p.directions_parking_info.trim()) {
    points += 2;
    strengths.push("parking info");
  } else {
    missing.push("parking info");
  }

  // FAQs (3 pts — rounds out the demo's ability to handle variety)
  const faqs = Array.isArray(p.faqs) ? p.faqs.filter((f) => f?.question && f?.answer) : [];
  if (faqs.length >= 3) { points += 3; strengths.push(`${faqs.length} FAQs`); }
  else if (faqs.length > 0) { points += 1; strengths.push(`${faqs.length} FAQs`); }
  else missing.push("FAQs");

  // Source citations — audit trail quality
  const sources = Array.isArray(p.research_sources) ? p.research_sources.filter((s) => s?.url) : [];
  if (sources.length >= 2) { strengths.push(`${sources.length} sources cited`); }
  else missing.push("research sources");

  const score = Math.min(1, Math.max(0, points / 100));
  return { score: Math.round(score * 100) / 100, total_points: points, missing, strengths };
}

export const AUTO_RUN_CONFIDENCE_THRESHOLD = 0.7;
