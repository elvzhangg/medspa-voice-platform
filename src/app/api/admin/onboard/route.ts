import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL + "/api/vapi/webhook";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, voice_id, greeting_message, initial_kb, area_code } = body;

    if (!name) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // 1. Buy phone number from Vapi
    let phoneNumber: { id: string; number: string } | null = null;

    // Try preferred area code first, then fall back
    const areaCodesToTry = [area_code || "415", "628", "510", "408", "323", "478"];

    for (const ac of areaCodesToTry) {
      // Modern Vapi endpoint — /phone-number/buy was deprecated late 2025
      const vapiRes = await fetch("https://api.vapi.ai/phone-number", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "vapi",
          numberDesiredAreaCode: ac,
          name: name,
          serverUrl: WEBHOOK_URL,
        }),
      });

      if (vapiRes.ok) {
        const data = await vapiRes.json();
        phoneNumber = { id: data.id, number: data.number };
        break;
      }
      const err = await vapiRes.json().catch(() => ({}));
      console.log(`Area code ${ac} not available:`, err.message);
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: "Could not provision phone number" }, { status: 500 });
    }

    // 2. Create tenant in Supabase
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name,
        slug,
        phone_number: phoneNumber.number,
        vapi_phone_number_id: phoneNumber.id,
        voice_id: voice_id || "EXAVITQu4vr4xnSDxMaL",
        greeting_message: greeting_message || `Thank you for calling ${name}! How can I help you today?`,
      })
      .select()
      .single();

    if (tenantError) {
      console.error("Failed to create tenant:", tenantError);
      return NextResponse.json({ error: "Failed to create tenant in database" }, { status: 500 });
    }

    // 3. If initial KB content provided, add as a document (embedding generated on read)
    if (initial_kb && initial_kb.trim()) {
      // Split by double newlines into chunks for better RAG
      const chunks = initial_kb
        .split(/\n\n+/)
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 50);

      if (chunks.length > 0) {
        // Generate embeddings and insert
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        for (let i = 0; i < Math.min(chunks.length, 20); i++) {
          const chunk = chunks[i];
          const title = chunk.slice(0, 50).replace(/\n/g, " ") + "...";

          try {
            const embRes = await openai.embeddings.create({
              model: "text-embedding-3-small",
              input: chunk,
            });
            const embedding = embRes.data[0].embedding;

            await supabaseAdmin.from("knowledge_base_documents").insert({
              tenant_id: tenant.id,
              title,
              content: chunk,
              category: "general",
              embedding,
            });
          } catch (embErr) {
            console.error("Failed to embed chunk:", embErr);
            // Continue with other chunks
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        phone_number: phoneNumber.number,
      },
    });
  } catch (err) {
    console.error("Onboard error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
