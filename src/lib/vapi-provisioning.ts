import { supabaseAdmin } from "./supabase";

const VAPI_API_KEY = process.env.VAPI_API_KEY || "a0e0b763-2636-40ea-be74-ac0227ec7be5";
const WEBHOOK_URL = "https://medspa-voice-platform.vercel.app/api/vapi/webhook";

interface ProvisionResult {
  success: boolean;
  phoneNumberId?: string;
  phoneNumber?: string;
  error?: string;
}

/**
 * Provisions a completely new phone number via Vapi for a specific tenant.
 * Uses Twilio under the hood (via Vapi).
 */
export async function provisionTenantNumber(tenantId: string, areaCode?: string): Promise<ProvisionResult> {
  console.log(`Provisioning new number for tenant: ${tenantId}...`);
  
  try {
    // 1. Buy a new number from Vapi
    // Vapi handles the actual telecom provisioning. We just request a new phone number.
    const createReq = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider: "vapi", // Let Vapi buy it
        name: `Tenant_${tenantId}`,
        // Set our universal webhook as the handler for this new number!
        serverUrl: WEBHOOK_URL
      })
    });

    if (!createReq.ok) {
      const errText = await createReq.text();
      console.error("VAPI_PROVISION_ERROR:", errText);
      return { success: false, error: errText };
    }

    const newNumberData = await createReq.json();
    console.log("SUCCESS! Got new number:", newNumberData);

    const phoneNumberId = newNumberData.id;
    const phoneNumber = newNumberData.number;

    // 2. Save the new number to our Tenant database
    // Now, whenever a call comes into this specific number, the webhook knows it belongs to this tenant.
    const { error: dbError } = await supabaseAdmin
      .from("tenants")
      .update({
        phone_number: phoneNumber,
        vapi_phone_number_id: phoneNumberId,
        updated_at: new Date().toISOString()
      })
      .eq("id", tenantId);

    if (dbError) {
      console.error("DB_UPDATE_ERROR:", dbError);
      return { success: false, error: "Failed to link number to tenant in DB: " + dbError.message };
    }

    return { 
      success: true, 
      phoneNumberId, 
      phoneNumber 
    };

  } catch (err: any) {
    console.error("Number provisioning exception:", err);
    return { success: false, error: err.message };
  }
}
