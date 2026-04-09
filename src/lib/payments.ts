/**
 * Payment integration module for VauxVoice
 * Supports Stripe Connect for multi-tenant payment processing
 */

import { supabaseAdmin } from "./supabase";

interface PaymentRequest {
  tenantId: string;
  amount: number;
  customerPhone: string;
  description?: string;
}

interface PaymentResult {
  success: boolean;
  message: string;
  paymentLink?: string;
}

/**
 * Process a payment request from the AI
 * - If tenant has Stripe connected, generate a Stripe Checkout link
 * - Otherwise, log as pending and staff follows up manually
 */
export async function createPaymentLink(request: PaymentRequest): Promise<PaymentResult> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, stripe_account_id")
    .eq("id", request.tenantId)
    .single();

  // No Stripe? Log it and return manual message
  if (!tenant?.stripe_account_id) {
    await supabaseAdmin.from("payment_requests").insert({
      tenant_id: request.tenantId,
      amount: request.amount,
      customer_phone: request.customerPhone,
      description: request.description || "Payment request",
      status: "pending",
    });

    return {
      success: true,
      message: `I've noted your payment of $${request.amount}. Our team will text you a secure payment link shortly.`,
    };
  }

  // Has Stripe - generate payment link
  // Note: In production, use the Stripe SDK to create a Checkout Session
  // This is a simplified version that generates a mock link
  const sessionId = `cs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const paymentLink = `https://checkout.stripe.com/c/pay/${sessionId}`;

  // Log the payment request
  await supabaseAdmin.from("payment_requests").insert({
    tenant_id: request.tenantId,
    amount: request.amount,
    customer_phone: request.customerPhone,
    description: request.description || "Payment request",
    status: "sent",
    stripe_session_id: sessionId,
    stripe_payment_link: paymentLink,
  });

  return {
    success: true,
    message: `I've just sent a secure payment link for $${request.amount} to your phone. You should receive it in a moment. Click the link to complete your payment securely.`,
    paymentLink,
  };
}

/**
 * Handle webhook from Stripe for payment completion
 */
export async function handleStripeWebhook(
  sessionId: string,
  paymentStatus: "paid" | "unpaid" | "no_payment_required"
) {
  const { data: payment } = await supabaseAdmin
    .from("payment_requests")
    .select("id, tenant_id")
    .eq("stripe_session_id", sessionId)
    .single();

  if (payment) {
    await supabaseAdmin
      .from("payment_requests")
      .update({
        status: paymentStatus === "paid" ? "completed" : "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
  }
}