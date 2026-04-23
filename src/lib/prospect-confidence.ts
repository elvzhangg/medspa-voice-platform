// Computes a deterministic confidence score (0.0–1.0) from which prospect fields
// are actually populated. Replaces the LLM's self-reported confidence, which drifts
// and overestimates.

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

interface ProspectLike {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  address?: string | null;
  procedures?: ProcedureLike[] | null;
  providers?: ProviderLike[] | null;
  hours?: Record<string, unknown> | null;
  research_sources?: SourceLike[] | null;
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

  // Basic contact (30 pts)
  if (p.website && p.website.trim()) { points += 10; strengths.push("website"); } else missing.push("website");
  if (p.phone && p.phone.trim()) { points += 10; strengths.push("phone"); } else missing.push("phone");
  if (p.email && p.email.trim()) { points += 5; strengths.push("general email"); } else missing.push("general email");
  if (p.address && p.address.trim()) { points += 5; strengths.push("address"); } else missing.push("address");

  // Owner contact — highest-leverage field for outreach (20 pts)
  if (p.owner_name && p.owner_name.trim()) { points += 5; strengths.push("owner name"); } else missing.push("owner name");
  if (p.owner_email && p.owner_email.trim()) { points += 15; strengths.push("owner email"); } else missing.push("owner email");

  // Procedures (25 pts — big because they drive the voice agent's knowledge)
  const procedures = Array.isArray(p.procedures) ? p.procedures.filter((x) => x?.name) : [];
  if (procedures.length >= 3) { points += 10; strengths.push(`${procedures.length} procedures`); }
  else if (procedures.length > 0) { points += 5; strengths.push(`${procedures.length} procedures`); }
  else missing.push("procedures");

  const procsWithPrice = procedures.filter((x) => x.price != null && String(x.price).trim() !== "");
  if (procsWithPrice.length >= 3) { points += 15; strengths.push(`${procsWithPrice.length} procedures with prices`); }
  else if (procsWithPrice.length > 0) { points += 8; strengths.push(`${procsWithPrice.length} procedure prices`); }
  else missing.push("procedure pricing");

  // Providers (10 pts)
  const providers = Array.isArray(p.providers) ? p.providers.filter((x) => x?.name) : [];
  if (providers.length > 0) { points += 10; strengths.push(`${providers.length} providers`); }
  else missing.push("providers");

  // Hours (10 pts)
  if (p.hours && typeof p.hours === "object" && Object.keys(p.hours).length >= 5) {
    points += 10;
    strengths.push("hours");
  } else {
    missing.push("hours");
  }

  // Source citations (5 pts — audit trail quality)
  const sources = Array.isArray(p.research_sources) ? p.research_sources.filter((s) => s?.url) : [];
  if (sources.length >= 2) { points += 5; strengths.push(`${sources.length} sources cited`); }
  else missing.push("research sources");

  const score = Math.min(1, Math.max(0, points / 100));
  return { score: Math.round(score * 100) / 100, total_points: points, missing, strengths };
}

export const AUTO_RUN_CONFIDENCE_THRESHOLD = 0.7;
