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

export type ToolSource =
  | { kind: "client"; clientProfileId: string; label: string }
  | { kind: "call"; callId: string; clientProfileId: string | null; label: string; when: string }
  | {
      kind: "appointment";
      clientProfileId: string | null;
      label: string;
      when: string;
    };

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

// ─── Tool 4: get_recent_calls ────────────────────────────────────────

export interface GetRecentCallsArgs {
  limit?: number;
  since_days?: number;
}

export interface RecentCallRow {
  call_id: string;
  client_profile_id: string | null;
  caller_name: string | null;
  phone: string | null;
  date: string;
  duration_seconds: number | null;
  summary: string | null;
}

export async function getRecentCalls(
  tenantId: string,
  args: GetRecentCallsArgs
): Promise<{ result: RecentCallRow[]; sources: ToolSource[] }> {
  const limit = Math.min(args.limit ?? 10, 50);
  let q = supabaseAdmin
    .from("call_logs")
    .select("id, caller_number, duration_seconds, summary, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeof args.since_days === "number" && args.since_days > 0) {
    const cutoff = new Date(Date.now() - args.since_days * 86_400_000).toISOString();
    q = q.gte("created_at", cutoff);
  }

  const { data: calls } = await q;
  const rows = (calls ?? []) as any[];

  // Resolve caller names via client_profiles in one batch
  const phones = Array.from(new Set(rows.map((r) => r.caller_number).filter(Boolean)));
  const { data: profiles } = phones.length
    ? await supabaseAdmin
        .from("client_profiles")
        .select("id, phone, first_name, last_name")
        .eq("tenant_id", tenantId)
        .in("phone", phones as string[])
    : { data: [] as any[] };
  const byPhone = new Map<string, { id: string; name: string }>();
  for (const p of profiles ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    byPhone.set(p.phone, { id: p.id, name: name || p.phone });
  }

  const result: RecentCallRow[] = rows.map((r) => {
    const match = r.caller_number ? byPhone.get(r.caller_number) : undefined;
    return {
      call_id: r.id,
      client_profile_id: match?.id ?? null,
      caller_name: match?.name ?? null,
      phone: r.caller_number,
      date: r.created_at,
      duration_seconds: r.duration_seconds,
      summary: r.summary,
    };
  });

  // Each call is its own clickable source — staff can open the exact
  // call log entry the AI quoted from.
  const sources: ToolSource[] = result.map((r) => ({
    kind: "call" as const,
    callId: r.call_id,
    clientProfileId: r.client_profile_id,
    label: r.caller_name
      ? `${r.caller_name} — ${new Date(r.date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      : `Call on ${new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    when: r.date,
  }));
  return { result, sources };
}

// ─── Tool 5: list_upcoming_appointments ──────────────────────────────

export interface UpcomingArgs {
  within_days?: number;
  limit?: number;
}

export interface UpcomingRow {
  date: string;
  customer_name: string | null;
  phone: string | null;
  service: string | null;
  status: string;
  client_profile_id: string | null;
}

export async function listUpcomingAppointments(
  tenantId: string,
  args: UpcomingArgs
): Promise<{ result: UpcomingRow[]; sources: ToolSource[] }> {
  const withinDays = Math.min(args.within_days ?? 7, 60);
  const limit = Math.min(args.limit ?? 20, 100);
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + withinDays * 86_400_000).toISOString();

  const { data } = await supabaseAdmin
    .from("calendar_events")
    .select("start_time, customer_name, customer_phone, service_type, status")
    .eq("tenant_id", tenantId)
    .gte("start_time", now)
    .lte("start_time", horizon)
    .order("start_time", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as any[];
  const phones = Array.from(
    new Set(rows.map((r) => r.customer_phone).filter(Boolean))
  );
  const { data: profs } = phones.length
    ? await supabaseAdmin
        .from("client_profiles")
        .select("id, phone")
        .eq("tenant_id", tenantId)
        .in("phone", phones as string[])
    : { data: [] as any[] };
  const idByPhone = new Map<string, string>();
  for (const p of profs ?? []) idByPhone.set(p.phone, p.id);

  const result: UpcomingRow[] = rows.map((r) => ({
    date: r.start_time,
    customer_name: r.customer_name,
    phone: r.customer_phone,
    service: r.service_type,
    status: r.status,
    client_profile_id: r.customer_phone ? idByPhone.get(r.customer_phone) ?? null : null,
  }));

  const sources: ToolSource[] = result.map((r) => ({
    kind: "appointment" as const,
    clientProfileId: r.client_profile_id,
    label: `${r.customer_name ?? "Appointment"} — ${new Date(r.date).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`,
    when: r.date,
  }));
  return { result, sources };
}

// ─── Tool 6: list_providers ──────────────────────────────────────────

export interface ProviderRow {
  name: string;
  title: string | null;
  services: string[];
  specialties: string[];
  ai_notes: string | null;
  working_hours: Record<string, { open: string; close: string }> | null;
  active: boolean;
}

export async function listProviders(
  tenantId: string
): Promise<{ result: ProviderRow[]; sources: ToolSource[] }> {
  const { data } = await supabaseAdmin
    .from("staff")
    .select("name, title, services, specialties, ai_notes, working_hours, active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");
  const result = (data ?? []).map((r: any) => ({
    name: r.name,
    title: r.title,
    services: r.services ?? [],
    specialties: r.specialties ?? [],
    ai_notes: r.ai_notes,
    working_hours: r.working_hours,
    active: r.active,
  }));
  return { result, sources: [] };
}

// ─── Tool 7: get_business_snapshot ───────────────────────────────────

export interface SnapshotRow {
  calls_today: number;
  calls_this_week: number;
  calls_this_month: number;
  bookings_today: number;
  bookings_this_week: number;
  upcoming_next_7_days: number;
  new_clients_this_week: number;
}

export async function getBusinessSnapshot(
  tenantId: string
): Promise<{ result: SnapshotRow; sources: ToolSource[] }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const [callsToday, callsWeek, callsMonth, bookingsToday, bookingsWeek, upcoming, newClients] =
    await Promise.all([
      supabaseAdmin
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfDay),
      supabaseAdmin
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
      supabaseAdmin
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", monthAgo),
      supabaseAdmin
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("start_time", startOfDay)
        .lt("start_time", new Date(Date.now() + 86_400_000).toISOString()),
      supabaseAdmin
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("start_time", weekAgo),
      supabaseAdmin
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("start_time", new Date().toISOString())
        .lt("start_time", in7Days),
      supabaseAdmin
        .from("client_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
    ]);

  return {
    result: {
      calls_today: callsToday.count ?? 0,
      calls_this_week: callsWeek.count ?? 0,
      calls_this_month: callsMonth.count ?? 0,
      bookings_today: bookingsToday.count ?? 0,
      bookings_this_week: bookingsWeek.count ?? 0,
      upcoming_next_7_days: upcoming.count ?? 0,
      new_clients_this_week: newClients.count ?? 0,
    },
    sources: [],
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
  {
    type: "function" as const,
    function: {
      name: "get_recent_calls",
      description:
        "Get the most recent phone calls to the AI Clientele Specialist with summaries and caller identity. Use for questions like 'tell me about the most recent call', 'what did the last 5 callers want', 'any calls today from new clients'.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max calls to return (default 10, max 50)." },
          since_days: {
            type: "number",
            description: "Only include calls from the last N days. Omit for no time limit.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_upcoming_appointments",
      description:
        "List upcoming appointments on the calendar within a time window. Use for 'what's on for tomorrow', 'who's coming in this week', 'any appointments today'.",
      parameters: {
        type: "object",
        properties: {
          within_days: {
            type: "number",
            description: "How far ahead to look, in days (default 7, max 60).",
          },
          limit: { type: "number", description: "Max appointments to return (default 20)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_providers",
      description:
        "List the clinic's active providers with their titles, specialties, AI notes, and working hours. Use when the user asks about staff generally: 'who are our providers', 'tell me about our team', 'which providers do Botox'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_business_snapshot",
      description:
        "Quick dashboard numbers for the clinic: call volume today/week/month, bookings, upcoming appointments, new clients this week. Use for 'how are we doing this week', 'how busy has it been', 'what are the numbers'.",
      parameters: { type: "object", properties: {} },
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
      case "get_recent_calls":
        return await getRecentCalls(tenantId, args as unknown as GetRecentCallsArgs);
      case "list_upcoming_appointments":
        return await listUpcomingAppointments(tenantId, args as unknown as UpcomingArgs);
      case "list_providers":
        return await listProviders(tenantId);
      case "get_business_snapshot":
        return await getBusinessSnapshot(tenantId);
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
