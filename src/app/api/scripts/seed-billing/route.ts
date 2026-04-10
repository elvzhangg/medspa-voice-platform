import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import OpenAI from "openai";

export async function GET() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const docs = [
    {
      title: "Glow Med Spa Billing & Payment Policy",
      category: "policies",
      content: "Payment Methods: Glow Med Spa accepts all major credit cards (Visa, Mastercard, Amex, Discover), cash, and HSA/FSA debit cards. All payments are due at the time of service.\n\nDeposit Policy: A $50 non-refundable deposit is required to secure any appointment. This deposit is applied directly to the cost of your treatment.\n\nCancellation Policy: We require 24-hour notice for any cancellations or rescheduling. Appointments cancelled less than 24 hours in advance will forfeit the $50 deposit.\n\nFinancing Options: For treatments over $500, we offer flexible payment plans through Cherry Financing and CareCredit. These allow you to pay for your treatment over time with options for 0% interest. You can apply in seconds during your visit or via the link we can text to you.\n\nInvoice Requests: If you need a detailed receipt for insurance reimbursement or personal records, please let our team know and we can email it to you within 24 hours.",
      sources: "Glow Med Spa Internal Billing Protocol"
    },
    {
      title: "Cherry Financing FAQ",
      category: "faq",
      content: "What is Cherry? Cherry is a payment plan designed for med spa treatments. It allows you to break up the cost of your Botox, fillers, or skincare into smaller monthly payments.\n\nHow do I apply? It's simple and fast. We send a link to your phone, you fill out a 60-second application, and get an instant decision.\n\nDoes it affect my credit? Cherry performs a soft credit check, so applying does not impact your credit score.\n\nWhat are the terms? Plans range from 3 to 24 months. Many of our patients qualify for 0% interest plans.",
      sources: "Cherry Financing Partnership Docs"
    }
  ];

  try {
    for (const doc of docs) {
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: doc.content
      });

      await supabaseAdmin.from("knowledge_base_documents").insert({
        tenant_id: "00000000-0000-0000-0000-000000000001",
        title: doc.title,
        category: doc.category as any,
        content: doc.content,
        sources: doc.sources,
        is_universal: false,
        embedding: embRes.data[0].embedding
      });
    }
    return NextResponse.json({ success: true, count: docs.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
