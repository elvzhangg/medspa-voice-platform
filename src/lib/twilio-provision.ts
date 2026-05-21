/**
 * Twilio + Vapi provisioning helpers — the "BYO Twilio" flow.
 *
 * Why this exists: previously we provisioned numbers via Vapi's own provider
 * (`provider: "vapi"`), which means the number physically lives in Vapi's
 * Twilio account. We can't send SMS from those numbers because we don't have
 * the credentials. This module buys numbers from OUR Twilio account, then
 * imports them into Vapi as BYO numbers, so the same number does inbound
 * voice (via Vapi) AND outbound SMS (via direct Twilio API). Tenants get
 * one consistent number for both channels.
 *
 * Environment:
 *   TWILIO_ACCOUNT_SID — required for any number purchase
 *   TWILIO_AUTH_TOKEN  — required for any number purchase
 *
 * Failure mode policy: if Vapi import fails after we successfully bought
 * a Twilio number, we release the Twilio number so it doesn't sit on the
 * account billing $1/mo forever. The caller gets a clear error and can
 * retry without leaking inventory.
 */

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const VAPI_API_BASE = "https://api.vapi.ai";

function twilioAuth(): { sid: string; token: string } | { error: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return {
      error:
        "Platform Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on Vercel and redeploy.",
    };
  }
  return { sid, token };
}

function basicAuthHeader(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

interface AvailableNumber {
  phoneNumber: string;  // E.164, e.g. "+14155550100"
  friendlyName: string;
  locality?: string;
  region?: string;
}

/**
 * Search Twilio for available US local numbers in a given area code.
 * Returns up to 5 candidates so the caller can try alternates if the
 * first buy fails (race condition with other purchasers).
 */
export async function findAvailableTwilioNumbers(
  areaCode: string,
  limit = 5
): Promise<{ numbers: AvailableNumber[] } | { error: string }> {
  const auth = twilioAuth();
  if ("error" in auth) return { error: auth.error };

  const url = new URL(
    `${TWILIO_API_BASE}/Accounts/${auth.sid}/AvailablePhoneNumbers/US/Local.json`
  );
  url.searchParams.set("AreaCode", areaCode);
  url.searchParams.set("SmsEnabled", "true");
  url.searchParams.set("VoiceEnabled", "true");
  url.searchParams.set("PageSize", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: basicAuthHeader(auth.sid, auth.token) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `Twilio search failed: ${res.status} ${body.slice(0, 300)}` };
  }
  const data = (await res.json()) as { available_phone_numbers?: Array<{ phone_number: string; friendly_name: string; locality?: string; region?: string }> };
  const numbers: AvailableNumber[] = (data.available_phone_numbers ?? []).map((n) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
    locality: n.locality,
    region: n.region,
  }));
  return { numbers };
}

interface PurchasedNumber {
  phoneNumber: string;   // E.164
  sid: string;           // Twilio IncomingPhoneNumber SID (PN...)
}

/**
 * Buy a specific number from Twilio. Returns the IncomingPhoneNumber SID
 * — required for any future DELETE/release call. The Voice URL is left
 * blank intentionally; Vapi will set it when we import the number.
 */
export async function buyTwilioNumber(
  phoneNumber: string,
  friendlyName?: string
): Promise<PurchasedNumber | { error: string }> {
  const auth = twilioAuth();
  if ("error" in auth) return { error: auth.error };

  const url = `${TWILIO_API_BASE}/Accounts/${auth.sid}/IncomingPhoneNumbers.json`;
  const body = new URLSearchParams({ PhoneNumber: phoneNumber });
  if (friendlyName) body.set("FriendlyName", friendlyName.slice(0, 64));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(auth.sid, auth.token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `Twilio buy failed: ${res.status} ${text.slice(0, 300)}` };
  }
  const data = (await res.json()) as { sid?: string; phone_number?: string };
  if (!data.sid || !data.phone_number) {
    return { error: "Twilio buy returned unexpected response (missing sid or phone_number)" };
  }
  return { phoneNumber: data.phone_number, sid: data.sid };
}

/**
 * Release a Twilio number back to the pool. Best-effort — failures are
 * logged but don't throw, since release is usually cleanup-after-error
 * and the original error is what the operator needs to see.
 */
export async function releaseTwilioNumber(twilioPhoneSid: string): Promise<void> {
  const auth = twilioAuth();
  if ("error" in auth) {
    console.warn("[twilio-provision] Cannot release — no Twilio creds:", twilioPhoneSid);
    return;
  }
  try {
    const res = await fetch(
      `${TWILIO_API_BASE}/Accounts/${auth.sid}/IncomingPhoneNumbers/${twilioPhoneSid}.json`,
      {
        method: "DELETE",
        headers: { Authorization: basicAuthHeader(auth.sid, auth.token) },
      }
    );
    if (!res.ok) {
      console.warn(
        `[twilio-provision] Failed to release Twilio number ${twilioPhoneSid}:`,
        res.status,
        (await res.text().catch(() => "")).slice(0, 200)
      );
    }
  } catch (err) {
    console.warn("[twilio-provision] Release threw:", err);
  }
}

interface VapiImportResult {
  vapiPhoneNumberId: string;
}

/**
 * Import an already-purchased Twilio number into Vapi as a BYO number.
 * Vapi takes our Twilio creds, calls Twilio on our behalf, and sets the
 * number's Voice URL to point at Vapi's ingress so inbound calls land
 * in the assistant flow. Returns the Vapi phone-number id we'll store
 * on the tenant for future patches / deletes.
 */
export async function importTwilioNumberIntoVapi(args: {
  phoneNumber: string;        // E.164 of the bought number
  serverUrl: string;          // our webhook
  vapiNumberName: string;     // display label inside Vapi dashboard
}): Promise<VapiImportResult | { error: string }> {
  const auth = twilioAuth();
  if ("error" in auth) return { error: auth.error };

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return { error: "VAPI_API_KEY not configured" };

  const res = await fetch(`${VAPI_API_BASE}/phone-number`, {
    method: "POST",
    headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "twilio",
      twilioAccountSid: auth.sid,
      twilioAuthToken: auth.token,
      number: args.phoneNumber,
      name: args.vapiNumberName,
      serverUrl: args.serverUrl,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `Vapi import failed: ${res.status} ${text.slice(0, 300)}` };
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) return { error: "Vapi import returned no id" };
  return { vapiPhoneNumberId: data.id };
}

/**
 * Best-effort release of a Vapi phone-number registration. Mirrors the
 * Twilio release semantics — used during migration to delete the old
 * Vapi-provisioned number after the new one is wired up.
 */
export async function releaseVapiNumber(vapiPhoneNumberId: string): Promise<void> {
  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return;
  try {
    await fetch(`${VAPI_API_BASE}/phone-number/${vapiPhoneNumberId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vapiKey}` },
    });
  } catch (err) {
    console.warn("[twilio-provision] Vapi release threw:", err);
  }
}

const FALLBACK_AREA_CODES = ["628", "213", "646", "305", "713", "404", "312"];
const MAX_AREA_CODE_ATTEMPTS = 8;
const NAME_MAX = 40; // matches existing fitAssistantName / fitVapiNumberName

function truncateName(name: string): string {
  if (name.length <= NAME_MAX) return name;
  const room = NAME_MAX - 1;
  const trimmed = name.slice(0, room).replace(/\s+\S*$/, "");
  return (trimmed.length > 0 ? trimmed : name.slice(0, room)) + "…";
}

/**
 * Full "buy from Twilio, import into Vapi" flow. Tries the preferred
 * area code first, falls through to a small geo-diverse pool if none
 * available there. On Vapi import failure, releases the Twilio number
 * so it doesn't sit billing forever.
 *
 * Returns everything the caller needs to write to the tenant row.
 */
export async function provisionBYOTwilioNumber(args: {
  preferredAreaCode: string | null;
  labelPrefix: "DEMO" | "CRM";
  businessName: string;
  serverUrl: string;
}): Promise<
  | { phoneNumber: string; twilioSid: string; vapiPhoneNumberId: string }
  | { error: string; attemptedAreaCodes: string[] }
> {
  const ordered = [args.preferredAreaCode, ...FALLBACK_AREA_CODES]
    .filter((x): x is string => Boolean(x))
    .slice(0, MAX_AREA_CODE_ATTEMPTS);
  const tried = new Set<string>();
  const errors: string[] = [];

  const vapiNumberName = truncateName(`${args.labelPrefix} - ${args.businessName.trim()}`);

  for (const areaCode of ordered) {
    if (tried.has(areaCode)) continue;
    tried.add(areaCode);

    // Step 1: find available numbers in this area code.
    const search = await findAvailableTwilioNumbers(areaCode, 5);
    if ("error" in search) {
      errors.push(`area ${areaCode}: ${search.error}`);
      // Twilio auth errors are unrecoverable — stop walking the pool.
      if (search.error.includes("401") || search.error.includes("403") || search.error.includes("not configured")) {
        return { error: search.error, attemptedAreaCodes: [...tried] };
      }
      continue;
    }
    if (search.numbers.length === 0) {
      errors.push(`area ${areaCode}: no available numbers`);
      continue;
    }

    // Step 2: buy the first candidate. Race-condition safe: if another
    // buyer grabbed it, Twilio returns an error and we try the next.
    let purchased: PurchasedNumber | null = null;
    for (const candidate of search.numbers) {
      const buy = await buyTwilioNumber(candidate.phoneNumber, vapiNumberName);
      if ("error" in buy) {
        errors.push(`buy ${candidate.phoneNumber}: ${buy.error}`);
        continue;
      }
      purchased = buy;
      break;
    }
    if (!purchased) {
      errors.push(`area ${areaCode}: all candidates failed to buy`);
      continue;
    }

    // Step 3: import the bought number into Vapi.
    const imported = await importTwilioNumberIntoVapi({
      phoneNumber: purchased.phoneNumber,
      serverUrl: args.serverUrl,
      vapiNumberName,
    });
    if ("error" in imported) {
      // Don't strand the number on the Twilio bill — release it.
      await releaseTwilioNumber(purchased.sid);
      errors.push(`vapi import for ${purchased.phoneNumber}: ${imported.error}`);
      continue;
    }

    return {
      phoneNumber: purchased.phoneNumber,
      twilioSid: purchased.sid,
      vapiPhoneNumberId: imported.vapiPhoneNumberId,
    };
  }

  return {
    error: errors[0] ?? `No Twilio numbers available across ${tried.size} area codes`,
    attemptedAreaCodes: [...tried],
  };
}
