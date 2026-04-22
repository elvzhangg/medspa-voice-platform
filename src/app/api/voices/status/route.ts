import { NextResponse } from "next/server";

/**
 * GET /api/voices/_status
 *
 * Diagnostic endpoint for the voice-preview pipeline. Reports:
 *   - Whether ELEVENLABS_API_KEY is set on this deployment
 *   - Whether the key is accepted by ElevenLabs (makes a tiny /user call)
 *   - Quota info if available
 *
 * Safe to expose — returns only boolean state + error messages, never
 * the key itself.
 *
 * Visit: https://<your-vercel-url>/api/voices/_status
 */

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      step: "env_var",
      message:
        "ELEVENLABS_API_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables and redeploy.",
    });
  }

  // Sanity check: keys usually start with "sk_" — catches obvious typos.
  const keyLooksOk = apiKey.startsWith("sk_");

  // Cheapest auth-testing endpoint ElevenLabs offers — /v1/user returns
  // subscription + account info on success, 401 on bad key.
  let elevenLabsStatus: number | null = null;
  let elevenLabsBody: unknown = null;
  let elevenLabsError: string | null = null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey, Accept: "application/json" },
    });
    elevenLabsStatus = res.status;
    try {
      elevenLabsBody = await res.json();
    } catch {
      elevenLabsBody = await res.text().catch(() => null);
    }
  } catch (err) {
    elevenLabsError = err instanceof Error ? err.message : String(err);
  }

  const ok = elevenLabsStatus === 200;

  // Redact anything sensitive from the body echo before returning.
  let safeBody: unknown = elevenLabsBody;
  if (elevenLabsBody && typeof elevenLabsBody === "object") {
    const b = elevenLabsBody as Record<string, unknown>;
    safeBody = {
      subscription_tier: (b.subscription as any)?.tier ?? null,
      character_limit: (b.subscription as any)?.character_limit ?? null,
      character_count: (b.subscription as any)?.character_count ?? null,
    };
  }

  return NextResponse.json({
    ok,
    step: ok ? "all_green" : "elevenlabs_call",
    env_var_set: true,
    key_shape_ok: keyLooksOk,
    elevenlabs_status: elevenLabsStatus,
    elevenlabs_error: elevenLabsError,
    account: ok ? safeBody : undefined,
    message: ok
      ? "Voice previews should work. Try a play button — if still silent, it's likely browser-side (autoplay policy, muted tab)."
      : elevenLabsStatus === 401
      ? "ElevenLabs rejected the key (401). Check the key's Text-to-Speech permission is set to Access."
      : elevenLabsStatus === 403
      ? "ElevenLabs returned 403 — the key doesn't have permission for the user endpoint. Permissions likely too restrictive."
      : elevenLabsStatus === 402
      ? "ElevenLabs returned 402 — account is out of credits or needs a paid tier for API use."
      : elevenLabsError
      ? `Network error calling ElevenLabs: ${elevenLabsError}`
      : `Unexpected ElevenLabs status ${elevenLabsStatus}.`,
  });
}
