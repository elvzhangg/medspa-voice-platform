import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";

/**
 * GET /api/voices/[id]/sample
 *
 * Streams a short MP3 sample for one of the curated preset voice IDs,
 * generated on-demand via ElevenLabs TTS. The Clinic Setup voice picker
 * calls this when a tenant clicks the play button.
 *
 * The `id` path param IS the ElevenLabs voice ID — we allowlist the
 * curated set so this endpoint can't be used as a general-purpose
 * ElevenLabs proxy (which would let anyone with the URL rack up usage).
 *
 * Sample text includes the tenant's clinic name when a session is
 * present, falling back to a generic greeting when not. Cache is
 * therefore `private` (browser-only) — edge can't share bytes across
 * tenants.
 *
 * Requires ELEVENLABS_API_KEY in env.
 */

// Allowlist of curated ElevenLabs voice IDs — mirrors VOICE_OPTIONS in
// src/app/dashboard/settings/page.tsx. Keep in sync if you add voices.
const ALLOWED_VOICE_IDS = new Set<string>([
  "EXAVITQu4vr4xnSDxMaL", // Sarah
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "MF3mGyEYCl7XYWbV9V6O", // Elli
  "ErXwobaYiN019PkySvjV", // Antoni
  "onwK4e9ZLuTAKqWW03F9", // Daniel
  "pNInz6obpgDQGcFmaJgB", // Adam
]);

function sampleTextFor(clinicName: string | null): string {
  return clinicName
    ? `Thank you for calling ${clinicName}! I'm your AI Clientele Specialist. How can I help you today?`
    : "Thank you for calling! I'm your AI Clientele Specialist. How can I help you today?";
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  if (!ALLOWED_VOICE_IDS.has(id)) {
    return NextResponse.json({ error: "Unknown voice" }, { status: 404 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice previews not configured" },
      { status: 503 }
    );
  }

  // Personalize the sample with the caller's clinic name when they're
  // logged in as a tenant. Fall back to a generic greeting for any
  // unauthenticated caller (e.g. the landing page — future use).
  const tenant = (await getCurrentTenant().catch(() => null)) as
    | { name?: string }
    | null;
  const SAMPLE_TEXT = sampleTextFor(tenant?.name ?? null);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: SAMPLE_TEXT,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("ELEVENLABS_SAMPLE_ERR:", res.status, detail.slice(0, 300));
    return NextResponse.json({ error: "Sample generation failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      // Private — content is tenant-specific so edge caches can't share
      // across tenants. Browser may cache for a day to avoid burning
      // ElevenLabs chars on repeat clicks by the same user.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
