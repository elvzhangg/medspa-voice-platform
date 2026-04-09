import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { tenantId, amount, customerPhone, description } = await req.json();

    if (!tenantId || !amount || !customerPhone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Get tenant Stripe config
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("stripe_account_id, name")
      .eq("id", tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      // Fallback: If no Stripe connected, we record it as a request
      await supabaseAdmin.from("payment_requests").insert({
        tenant_id: tenantId,
        amount,
        customer_phone: customerPhone,
        description,
        status: "pending"
      });

      return NextResponse.json({ 
        success: true, 
        mode: "manual",
        message: `I've created a payment request for $${amount}. Our team will text you a secure payment link shortly.`
      });
    }

    // 2. Real Stripe Link Generation (Placeholder - requires stripe package)
    // In a real app, you'd use Stripe Connected Accounts here
    const paymentLink = `https://buy.stripe.com/test_vauxvoice_${tenantId}_${amount}`;

    return NextResponse.json({ 
      success: true, 
      mode: "stripe",
      paymentLink,
      message: `I've just sent a secure payment link for $${amount} to your phone. You should receive it in a moment.`
    });

  } catch (error) {
    console.error("PAYMENT_LINK_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
