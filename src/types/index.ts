export interface Tenant {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  vapi_assistant_id?: string;
  voice_id: string;
  greeting_message: string;
  system_prompt_override?: string;
  business_hours?: BusinessHours;
  created_at: string;
  updated_at: string;
}

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string; // "09:00"
  close: string; // "18:00"
}

export interface KnowledgeBaseDocument {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  category: "services" | "pricing" | "policies" | "faq" | "general";
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface VapiCallPayload {
  message: {
    type: "assistant-request" | "function-call" | "end-of-call-report" | "status-update";
    call: {
      id: string;
      phoneNumber?: {
        number: string;
      };
      customer?: {
        number: string;
      };
    };
    functionCall?: {
      name: string;
      parameters: Record<string, unknown>;
    };
  };
}

export interface AssistantConfig {
  assistantId?: string;
  assistant?: TransientAssistantConfig;
}

export interface TransientAssistantConfig {
  name: string;
  model: {
    provider: string;
    model: string;
    systemPrompt: string;
    tools?: VapiTool[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  endCallMessage: string;
}

export interface VapiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  server?: {
    url: string;
  };
}
