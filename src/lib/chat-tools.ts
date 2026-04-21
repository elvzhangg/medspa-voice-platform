import OpenAI from "openai";
import { supabaseAdmin } from "./supabase";

/**
 * Retrieval tools for the staff chatbot. Every function here takes
 * `tenantId` as its first argument and scopes every query on it — the
 * privacy perimeter is structural, never a prompt instruction.
 *
 * The chat engine exposes these as OpenAI tool definitions and lets the
 * model pick which to call per question. No upfront classifier.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });

export interface ToolSource {
  kind: "client";
  clientProfileId: string;
  label: string;
}

// ─── Tool 1: get_client_context ──────────────────────────────────────

export interface GetClientContextArgs {
  /** Full or partial name, or phone number. */
  identifier: string;
}

export interface ClientContext {
  client_profile_id: string;
  name: string;
  phone: string;
  total_calls: number;
  total_bookings: number;
  last_call_at: string | null;
  last_service: string | null;
  last_provider: string | null;
  preferred_provider: string | null;
  tags: string[];
  staff_notes: string | null;
  summary: string | null;
  recent_calls: Array<{
    date: string;
    duration_seconds: number | null;
    summary: string | null;
  }>;
  upcoming_appointments: Array<{
    date: string;
    service: string | null;
    status: string;
  }>;
}

export async function getClientContext(
  tenantId: string,
  args: GetClientContextArgs
): Promise<{ result: ClientContext | null; sources: ToolSource[] }> {
  const needle = args.identifier.trim();
  if (!needle) return { result: null, sources: [] };

  // Match by phone (digits-only contains) or name (case-insensitive).
  const digits = needle.replace(/\D/g, "");
  const { data: profiles } = await supabaseAdmin
    .from("client_profiles")
    .select(
      "id, phone, first_name, last_name, total_calls, total_bookings, last_call_at, last_service, last_provider, preferred_provider, tags, staff_notes, summary"
    )
    .eq("tenant_id", tenantId)
    .or(
      digits.length >= 4
        ? `phone.ilike.%${digits}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`
        : `first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`
    )
    .limit(1);

  const p = profiles?.[0];
  if (!p) return { result: null, sources: [] };

  const [{ data: calls }, { data: events }] = await Promise.all([
    supabaseAdmin
      .from("call_logs")
      .select("created_at, duration_seconds, summary")
      .eq("tenant_id", tenantId)
      .eq("caller_number", p.phone)
      .order("created_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("calendar_events")
      .select("start_time, service_type, status")
      .eq("tenant_id", tenantId)
      .eq("customer_phone", p.phone)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(3),
  ]);

  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.phone;

  return {
    result: {
      client_profile_id: p.id,
      name,
      phone: p.phone,
      total_calls: p.total_calls,
      total_bookings: p.total_bookings,
      last_call_at: p.last_call_at,
      last_service: p.last_service,
      last_provider: p.last_provider,
      preferred_provider: p.preferred_provider,
      tags: p.tags || [],
      staff_notes: p.staff_notes,
      summary: p.summary,
      recent_calls: (calls ?? []).map((c: any) => ({
        date: c.created_at,
        duration_seconds: c.duration_seconds,
        summary: c.summary,
      })),
      upcoming_appointments: (events ?? []).map((e: any) => ({
        date: e.start_time,
        service: e.service_type,
        status: e.status,
      })),
    },
    sources: [{ kind: "client", clientProfileId: p.id, label: name }],
  };
}

// ─── Tool 2: filter_clients ──────────────────────────────────────────

export interface FilterClientsArgs {
  not_seen_days?: number;        // "hasn't called in N days"
  has_tag?: string;              // exact tag match
  service?: string;              // last_service contains
  provider?: string;             // preferred_provider or last_provider contains
  has_upcoming?: boolean;        // has an upcoming calendar_event
  limit?: number;
}

export interface FilterClientsRow {
  client_profile_id: string;
  name: string;
  phone: string;
  last_call_at: string | null;
  last_service: string | null;
  total_calls: number;
}

export async function filterClients(
  tenantId: string,
  args: FilterClientsArgs
): Promise<{ result: FilterClientsRow[]; sources: ToolSource[] }> {
  let q = supabaseAdmin
    .from("client_profiles")
    .select(
      "id, phone, first_name, last_name, last_call_at, last_service, last_provider, preferred_provider, tags, total_calls"
    )
    .eq("tenant_id", tenantId);

  if (typeof args.not_seen_days === "number" && args.not_seen_days > 0) {
    const cutoff = new Date(Date.now() - args.not_seen_days * 86_400_000).toISOString();
    q = q.or(`last_call_at.lt.${cutoff},last_call_at.is.null`);
  }
  if (args.has_tag) {
    q = q.contains("tags", [args.has_tag]);
  }
  if (args.service) {
    q = q.ilike("last_service", `%${args.service}%`);
  }
  if (args.provider) {
    q = q.or(
      `preferred_provider.ilike.%${args.provider}%,last_provider.ilike.%${args.provider}%`
    );
  }

  q = q.order("last_call_at", { ascending: false, nullsFirst: false }).limit(args.limit ?? 25);

  const { data } = await q;
  let rows = (data ?? []) as any[];

  // has_upcoming is a join-ish filter; do it in-memory over the result set
  // rather than writing a complex SQL — at limit=25 this is fine.
  if (args.has_upcoming) {
    const phones = rows.map((r) => r.phone);
    if (phones.length) {
      const { data: evs } = await supabaseAdmin
        .from("calendar_events")
        .select("customer_phone")
        .eq("tenant_id", tenantId)
        .gte("start_time", new Date().toISOString())
        .in("customer_phone", phones);
      const set = new Set((evs ?? []).map((e: any) => e.customer_phone));
      rows = rows.filter((r) => set.has(r.phone));
    }
  }

  const result: FilterClientsRow[] = rows.map((r) => ({
    client_profile_id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.phone,
    phone: r.phone,
    last_call_at: r.last_call_at,
    last_service: r.last_service,
    total_calls: r.total_calls,
  }));
  const sources: ToolSource[] = result.map((r) => ({
    kind: "client",
    clientProfileId: r.client_profile_id,
    label: r.name,
  }));
  return { result, sources };
}

// ─── Tool 3: search_clients_by_keyword ───────────────────────────────

export interface SearchClientsArgs {
  /** Natural-language search phrase. Matched semantically against client summaries. */
  query: string;
  limit?: number;
}

export interface SearchClientsRow {
  client_profile_id: string;
  name: string;
  phone: string;
  similarity: number;
  summary_excerpt: string;
}

export async function searchClientsByKeyword(
  tenantId: string,
  args: SearchClientsArgs
): Promise<{ result: SearchClientsRow[]; sources: ToolSource[] }> {
  const query = args.query.trim();
  if (!query) return { result: [], sources: [] };

  const limit = args.limit ?? 10;

  // Embed the query and match against client_profiles.summary_embedding.
  // Fall back to ILIKE over summary + staff_notes if the embedding call
  // fails (transient OpenAI hiccup).
  let embedding: number[] | null = null;
  try {
    const embRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    embedding = embRes.data[0]?.embedding ?? null;
  } catch (err) {
    console.warn("SEARCH_CLIENTS_EMBED_FAILED_FALLBACK_ILIKE:", err);
  }

  if (embedding) {
    const { data, error } = await supabaseAdmin.rpc("match_client_summaries", {
      p_tenant_id: tenantId,
      p_query_embedding: embedding,
      p_match_count: limit,
    });
    if (!error && Array.isArray(data)) {
      const rows = data as any[];
      const result: SearchClientsRow[] = rows.map((r) => ({
        client_profile_id: r.id,
        name:
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.phone,
        phone: r.phone,
        similarity: Number(r.similarity ?? 0),
        summary_excerpt: (r.summary as string | null)?.slice(0, 260) ?? "",
      }));
      return {
        result,
        sources: result.map((r) => ({
          kind: "client",
          clientProfileId: r.client_profile_id,
          label: r.name,
        })),
      };
    }
    console.warn("MATCH_CLIENT_SUMMARIES_RPC_ERR:", error);
  }

  // ILIKE fallback: scan summaries + staff_notes. OK for small tenants;
  // revisit if the chat endpoint starts timing out.
  const pattern = `%${query}%`;
  const { data } = await supabaseAdmin
    .from("client_profiles")
    .select("id, phone, first_name, last_name, summary, staff_notes")
    .eq("tenant_id", tenantId)
    .or(`summary.ilike.${pattern},staff_notes.ilike.${pattern}`)
    .limit(limit);

  const rows = (data ?? []) as any[];
  const result: SearchClientsRow[] = rows.map((r) => ({
    client_profile_id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.phone,
    phone: r.phone,
    similarity: 0, // ILIKE fallback has no score
    summary_excerpt: (r.summary as string | null)?.slice(0, 260) ?? "",
  }));
  return {
    result,
    sources: result.map((r) => ({
      kind: "client",
      clientProfileId: r.client_profile_id,
      label: r.name,
    })),
  };
}

// ─── Tool definitions for the OpenAI API ─────────────────────────────

export const CHAT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_client_context",
      description:
        "Fetch everything we know about one specific client: profile, recent calls, upcoming appointments, summary. Use when the staff question is about a named or identified client.",
      parameters: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description:
              "Client's full or partial name, OR their phone number (any format).",
          },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "filter_clients",
      description:
        "Return clients matching structured filters. Use for questions like 'who hasn't visited in 60 days', 'which VIP clients have an appointment tomorrow', 'who's booked with Dr. Sarah recently'.",
      parameters: {
        type: "object",
        properties: {
          not_seen_days: {
            type: "number",
            description:
              "Include clients whose last call is older than N days (or who have never called).",
          },
          has_tag: {
            type: "string",
            description: "Exact tag to match, e.g. 'VIP' or 'Botox regular'.",
          },
          service: {
            type: "string",
            description:
              "Partial service name — matches against the client's most recent service.",
          },
          provider: {
            type: "string",
            description:
              "Provider name — matches preferred OR most recent provider.",
          },
          has_upcoming: {
            type: "boolean",
            description: "Only include clients with an upcoming calendar event.",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default 25).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_clients_by_keyword",
      description:
        "Semantic search across client summaries and staff notes. Use for narrative cross-client questions like 'who mentioned a wedding', 'anyone asked about financing recently', 'which clients have been anxious about needles'.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language search phrase.",
          },
          limit: { type: "number", description: "Max matches to return (default 10)." },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Dispatch helper ─────────────────────────────────────────────────

export async function runTool(
  tenantId: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ result: unknown; sources: ToolSource[]; error?: string }> {
  try {
    // Cast via unknown — the OpenAI tool runtime hands us a free-shape
    // Record and the model is responsible for populating the right fields.
    // Each tool implementation validates its own required inputs.
    switch (name) {
      case "get_client_context":
        return await getClientContext(tenantId, args as unknown as GetClientContextArgs);
      case "filter_clients":
        return await filterClients(tenantId, args as unknown as FilterClientsArgs);
      case "search_clients_by_keyword":
        return await searchClientsByKeyword(tenantId, args as unknown as SearchClientsArgs);
      default:
        return {
          result: null,
          sources: [],
          error: `Unknown tool: ${name}`,
        };
    }
  } catch (err) {
    return {
      result: null,
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
