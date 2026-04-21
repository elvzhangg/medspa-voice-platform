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
  | "appointment.rescheduled";

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
}

export interface AdapterClientVisit {
  /** ISO date of the visit (completed appointment) */
  date: string;
  service?: string;
  staff?: string;
  /** Price in cents if the platform reports it */
  priceCents?: number;
  status?: string;
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
