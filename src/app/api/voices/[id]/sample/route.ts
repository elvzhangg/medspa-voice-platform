import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/voices/[id]/sample
 *
 * Streams a short MP3 sample for a preset voice ID (rachel / drew / natasha),
 * generated on-demand via ElevenLabs TTS. The Clinic Setup voice picker
 * calls this when a tenant clicks the play button.
 *
 * Requires ELEVENLABS_API_KEY. If the env var isn't set, returns 503 with
 * a clear error — the picker handles that gracefully by showing an info
 * tooltip instead of silently failing.
 *
 * The response is cached aggressively (immutable) — the sample never
 * changes for a given voice ID, so browsers + Vercel edge can reuse it.
 */

// Public ElevenLabs voice IDs matching our preset labels.
const VOICE_IDS: Record<string, string> = {
  rachel: "21m00Tcm4TlvDq8ikWAM",
  drew: "29vD33N1CtxCmqQRPOHJ",
  natasha: "XrExE9yKIg1WjnnlVkGX",
};

const SAMPLE_TEXT =
  "Thank you for calling! I'm your AI receptionist. How can I help you today?";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const voiceId = VOICE_IDS[id];
  if (!voiceId) {
    return NextResponse.json({ error: "Unknown voice" }, { status: 404 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Voice previews require ELEVENLABS_API_KEY to be set. Samples are generated on demand from ElevenLabs.",
      },
      { status: 503 }
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
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
    return NextResponse.json(
      { error: "Voice sample generation failed" },
      { status: 502 }
    );
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      // Samples are identical forever for a given voice ID — cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
