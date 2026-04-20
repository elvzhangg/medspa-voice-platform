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

export interface BookingAdapter {
  platform: string;

  /** Light auth + reachability check. Called by the admin "Test connection" button. */
  testConnection(ctx: AdapterContext): Promise<AdapterTestResult>;

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
