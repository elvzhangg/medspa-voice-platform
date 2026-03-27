import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, business_name, phone } = body;

    if (!name || !email || !business_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("demo_requests").insert({
      name,
      email,
      business_name,
      phone: phone || null,
    });

    if (error) {
      console.error("Failed to save demo request:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("Demo request error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
