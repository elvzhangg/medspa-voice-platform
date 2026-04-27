/**
 * Booking adapter interface — one implementation per supported platform.
 * All direct-book platforms (Boulevard, Acuity, Mindbody, Square, Zenoti)
 * implement these four calls; the rest (Fresha, GlossGenius, self-managed)
 * skip the adapter entirely and run in SMS fallback mode.
 */

export interface AdapterCredentials {
  [key: string]: string | undefined;
}

export interface AdapterConfig {
  [key: string]: string | undefined;
}

export interface AdapterContext {
  credentials: AdapterCredentials;
  config: AdapterConfig;
}

export interface AdapterSlot {
  /** "9:30 AM" — human-readable, what we read back to callers */
  label: string;
  /** ISO 8601 start timestamp — what we pass to bookAppointment */
  startTime: string;
  staffId?: string;
  staffName?: string;
  serviceId?: string;
}

export interface AdapterBookingInput {
  service: string;
  startTime: string;           // ISO — must come from a prior getAvailableSlots call
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  staffId?: string;
  serviceId?: string;
  notes?: string;
}

export interface AdapterBookingResult {
  ok: boolean;
  appointmentId?: string;
  /** Machine-readable reason on failure so the caller can decide whether to retry */
  error?: string;
  errorCode?: "auth" | "unavailable" | "validation" | "network" | "unknown";
}

export interface AdapterTestResult {
  ok: boolean;
  detail?: string;
  businessName?: string;
}

export type AdapterWebhookEventType =
  | "appointment.created"
  | "appointment.updated"
  | "appointment.cancelled"
  | "appointment.rescheduled"
  | "appointment.completed";

export interface AdapterWebhookEvent {
  signatureOk: boolean;
  eventType: AdapterWebhookEventType;
  /** Platform-side appointment id — used as external_id for upsert */
  externalId: string;
  startTime?: string;     // ISO — required for created/updated/rescheduled
  endTime?: string;
  serviceName?: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
  /** true when the event signals the appointment should be removed from our calendar */
  cancelled?: boolean;
  /** Price in cents — present on completion events that carry payment info */
  priceCents?: number;
  /** Raw platform status string (e.g. "COMPLETED", "CLOSED", "PAID") for audit */
  platformStatus?: string;
}

export interface AdapterClientVisit {
  /** Platform-side appointment id — used as external_id for client_visits upsert */
  externalId?: string;
  /** ISO date of the visit (completed appointment) */
  date: string;
  service?: string;
  staff?: string;
  /** Price in cents if the platform reports it */
  priceCents?: number;
  status?: string;
  /** Full raw platform payload for the visit, stored for future re-derivation */
  raw?: unknown;
}

export interface AdapterClientHistory {
  /** Platform-side client id — stashed in client_profiles.provider_refs */
  clientId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  visits: AdapterClientVisit[];
  /** Lifetime spend in cents, if computable */
  lifetimeValueCents?: number;
}

/**
 * One appointment as returned by a backfill / pull-style listAppointments
 * call. Same shape we eventually upsert to calendar_events. The webhook
 * path normalizes its own payload to this shape too, so both ingestion
 * routes funnel through one writer.
 *
 * `status` is the adapter's normalized rollup — "confirmed" covers
 * booked/scheduled/checked-in, "cancelled" covers cancel + no-show + late
 * cancel, "completed" is paid/closed. `platformStatus` keeps the raw
 * string for audit.
 */
export interface AdapterAppointment {
  /** Platform-side appointment id — upsert key */
  externalId: string;
  /**
   * ISO 8601 start. Always set on listAppointments rows; may be absent on
   * webhook-derived cancellations where the platform omits the timestamp.
   * The writer drops "confirmed" appointments without a start; "cancelled"
   * and "completed" tolerate it (they only update existing rows).
   */
  startTime?: string;
  endTime?: string;
  serviceName?: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
  status: "confirmed" | "cancelled" | "completed";
  /** Price in cents — present on completed appointments that carry payment info */
  priceCents?: number;
  /** Raw platform status string (e.g. "Booked", "Late Cancel") for audit */
  platformStatus?: string;
}

/**
 * Provider/staff record pulled from a booking platform. Used by the
 * periodic roster sync to keep our `staff` table current — tenant-authored
 * ai_notes + specialties are layered on top and never overwritten.
 */
export interface AdapterProvider {
  /** Platform-side staff identifier — the upsert key */
  externalId: string;
  /** Full display name */
  name: string;
  /** Role/title, e.g. "Nurse Injector", "Aesthetician". Optional — not all platforms carry it. */
  title?: string;
  /** Services this provider performs (platform-sourced). Free-text list. */
  services?: string[];
  /**
   * Weekly working hours keyed by lowercase day name. Shape mirrors our
   * `staff.working_hours` JSONB default so a sync can upsert directly.
   * Only include days the provider works — missing = off that day.
   */
  workingHours?: Record<string, { open: string; close: string }>;
  /** False when the platform reports the staff as disabled/terminated. */
  active?: boolean;
  /**
   * About-me / bio prose pulled from the platform's staff record.
   * Platform-sourced — overwritten on each sync. Adapters omit this if
   * the platform doesn't surface a bio.
   */
  bio?: string;
}

export interface BookingAdapter {
  platform: string;

  /** Light auth + reachability check. Called by the admin "Test connection" button. */
  testConnection(ctx: AdapterContext): Promise<AdapterTestResult>;

  /**
   * Optional — parse and verify an inbound webhook from the platform.
   * Route handler passes the raw request headers + body; the adapter is
   * responsible for HMAC/signature verification using ctx.credentials
   * (e.g. the webhook_secret the admin configured). Return null for
   * events we don't care about (pings, unsupported event types).
   */
  parseWebhookEvent?(
    ctx: AdapterContext,
    args: { headers: Record<string, string>; rawBody: string }
  ): Promise<AdapterWebhookEvent | null>;

  /**
   * Optional — pull a client's history (identity + past visits) by phone.
   * Used by the client-sync job so returning callers can be greeted with
   * "Want your usual laser with Dr. Sarah?". Return null if no match.
   * Adapters may omit this if the platform's API doesn't surface history.
   */
  getClientHistory?(
    ctx: AdapterContext,
    args: { phone: string }
  ): Promise<AdapterClientHistory | null>;

  /**
   * Optional — list every provider/staff member at the tenant's location.
   * Called by provider-sync on (a) admin flipping status to 'connected'
   * and (b) the daily cron. Adapters that don't expose a staff endpoint
   * may omit this — the sync will skip them and the tenant falls back to
   * manual roster entry in the dashboard.
   *
   * Must throw on auth/network failure so the sync marks the attempt
   * failed rather than silently wiping the roster.
   */
  listProviders?(ctx: AdapterContext): Promise<AdapterProvider[]>;

  /**
   * Optional — pull every appointment in [since, until] from the platform.
   * Used by the manual "Sync now" button as a webhook safety net so dropped
   * or unsigned events still reconcile into calendar_events. Adapters
   * should chunk by whatever window the platform allows and paginate
   * internally — return the flat list. Throw on auth/network failure.
   *
   * Adapters that don't expose a list endpoint may omit this; the sync
   * orchestrator skips them silently.
   */
  listAppointments?(
    ctx: AdapterContext,
    args: { since: string; until: string }
  ): Promise<AdapterAppointment[]>;

  /**
   * Query the platform for bookable slots on a given date.
   * Return [] if no availability (caller should then tell the customer
   * "nothing open, try another day"). Throwing signals a platform
   * outage — caller should fall back to SMS flow.
   */
  getAvailableSlots(
    ctx: AdapterContext,
    args: { date: string; service?: string; provider?: string }
  ): Promise<AdapterSlot[]>;

  /** Create the appointment. Idempotency is adapter-specific. */
  bookAppointment(
    ctx: AdapterContext,
    input: AdapterBookingInput
  ): Promise<AdapterBookingResult>;
}
