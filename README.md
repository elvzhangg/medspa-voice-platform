# MedSpa Voice Platform

A multi-tenant AI voice support platform for med spa businesses, powered by [Vapi AI](https://vapi.ai).

## Architecture

```
Customer Call → Vapi → Webhook (Next.js) → Tenant Lookup → KB Search → Personalized Assistant
```

Each med spa gets:
- Their own phone number (Vapi)
- A personalized AI Clientele Specialist (name, voice, greeting)
- A private knowledge base (services, pricing, policies, FAQs)
- A booking handler (extensible to Acuity, Mindbody, etc.)

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database | Supabase (Postgres + pgvector) |
| Voice AI | Vapi AI |
| Embeddings | OpenAI text-embedding-3-small |
| Deployment | Vercel |

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/elvzhangg/medspa-voice-platform
cd medspa-voice-platform
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration: `supabase/migrations/001_initial_schema.sql`
3. Copy your project URL and keys to `.env.local`

### 3. Configure environment

```bash
cp .env.example .env.local
# Fill in all values
```

### 4. Set up Vapi

1. Create an account at [vapi.ai](https://vapi.ai)
2. Get a phone number for each med spa
3. Set the webhook URL to: `https://your-app.com/api/vapi/webhook`

### 5. Add a tenant

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Glow Med Spa",
    "slug": "glow-med-spa",
    "phone_number": "+14155551234",
    "voice_id": "rachel",
    "greeting_message": "Thank you for calling Glow Med Spa! How can I help you today?"
  }'
```

### 6. Add knowledge base documents

```bash
curl -X POST http://localhost:3000/api/knowledge-base \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "title": "Our Services",
    "content": "We offer Botox ($12/unit), filler ($650+), laser hair removal, HydraFacial ($150), and more.",
    "category": "services"
  }'
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/vapi/webhook` | POST | Vapi webhook (assistant-request, function-call, end-of-call) |
| `/api/tenants` | GET | List all tenants |
| `/api/tenants` | POST | Create a tenant |
| `/api/knowledge-base` | GET | List/search documents for a tenant |
| `/api/knowledge-base` | POST | Add a knowledge base document |

## Roadmap

- [ ] Admin dashboard UI (tenant management + KB editor)
- [ ] Booking system integration (Acuity / Mindbody)
- [ ] Call analytics dashboard
- [ ] Inbound + outbound call support
- [ ] Multi-language support
- [ ] SMS follow-up after calls
