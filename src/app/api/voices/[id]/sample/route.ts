import { NextRequest, NextResponse } from "next/server";

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
 * Requires ELEVENLABS_API_KEY in env.
 *
 * Response is cached immutably — the sample never changes for a given
 * voice ID, so browsers + Vercel edge reuse the same bytes across clicks.
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

const SAMPLE_TEXT =
  "Thank you for calling! I'm your AI Clientele Specialist. How can I help you today?";

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
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
