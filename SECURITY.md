# Security & HIPAA Posture

> **Status (as of 2026-04-22): NOT READY for real PHI.** Friendly-beta / test-tenant only.
>
> Audit tables and write points exist. The compliance posture (BAAs, retention, tamper-proofing, alerting) does not. Do not accept a real med spa tenant with real patient data until the **Before accepting real PHI** checklist below is green.

---

## What's built ✅

### Database-level controls

| Surface | Mechanism |
|---|---|
| Multi-tenant isolation | Row Level Security (RLS) on every PHI-bearing table, scoped by `tenant_id` via the `tenant_users` membership table |
| Service role writes | All server-side writes use `supabaseAdmin` (service role) which bypasses RLS; application code is the first line of defense, RLS is the second |
| Structural scoping | Every DB helper (retrieval in `chat-tools.ts`, `client-brief.ts`, `provider-sync.ts`) takes `tenant_id` as its first argument and filters on it — hard to forget |

### Audit tables

| Table | Captures | Written by |
|---|---|---|
| `chat_access_audit` | Who viewed which client when, via chat or brief. Actions: `brief_view`, `chat_query`, `summary_regenerate` | `POST /api/chat`, `GET /api/clients/[id]/brief` |
| `client_profile_updates` | Field-level history of client profile edits (old value → new value, source) | Client profile PATCH endpoint |
| `platform_webhook_events` | Raw inbound integration webhooks — signature check, parse result, raw headers/body | Platform webhook handler |

### Audit integrity

- Audit-write failures in `/api/chat` and `/api/clients/[id]/brief` log with prefix `HIPAA_AUDIT_WRITE_FAILED` carrying tenant/user/client IDs. Silent loss is now a visible log event.
- Request flow does **not** fail on audit write failure (user-perceived view already happened) — but the log is retained for 30 days on Vercel Pro.

### Auth & session

- `getCurrentTenant()` validates the caller's Supabase session and resolves their tenant membership
- `getSession()` exposes `user_id` for audit attribution
- No endpoint bypasses auth; all API routes require both (except public webhook receivers which use HMAC signatures)

---

## What's missing ❌

### Critical blockers (must close before real PHI)

| Gap | Why it matters | Effort |
|---|---|---|
| **BAA with OpenAI** | GPT-4o/embeddings see call transcripts + client summaries. No BAA = no PHI via this path, period. | Apply via OpenAI's BAA + Zero Data Retention program |
| **BAA with Supabase** | All PHI lives here. Free tier has no BAA; requires **Enterprise** plan. | Contact Supabase sales, plan upgrade |
| **BAA with Vercel** | PHI passes through their runtime + logs. Requires **Enterprise** plan. | Contact Vercel sales, plan upgrade |
| **BAA with Vapi** | Call audio + transcripts touch their infra. | Confirm with Vapi directly |
| **BAA with ElevenLabs** | TTS for voice previews; voice ID doesn't contain PHI but API request metadata does if caller names are ever in samples. Low risk if samples stay generic. | Lower priority unless samples become personalized |
| **BAA with Twilio** | SMS flows reach patients directly; patient phone + appointment details transit Twilio. Requires signed BAA. | Twilio offers BAA at Enterprise |

### High-priority engineering gaps

| Gap | Description | Fix |
|---|---|---|
| **Log drain for HIPAA audit trail** | Vercel's runtime logs retain 30 days on Pro. HIPAA wants ~6 years. `HIPAA_AUDIT_WRITE_FAILED` events must survive long-term. | Pipe Vercel logs → Axiom / Datadog / BetterStack (all offer BAAs). ~30 min setup. |
| **Tamper protection on audit tables** | `service_role` can modify/delete `chat_access_audit` rows. A bad actor with DB access could erase tracks. | Options: (a) trigger that forbids UPDATE/DELETE on audit rows; (b) hash-chain approach so tampering breaks the chain; (c) mirror audit to an append-only sink (S3 Object Lock, or a WORM log service). |
| **Alerting on audit failures** | `HIPAA_AUDIT_WRITE_FAILED` shouts into the void today. No one sees until someone goes looking. | Log-based alert rule in the chosen log drain. Page/email on any match. |
| **Retention policy** | No documented lifecycle for `chat_access_audit`, `call_logs`, `client_profiles`, `chat_messages`. | Write it down, enforce with scheduled cleanup or archival. Typical HIPAA minimum: 6 years. |
| **Tenant-facing audit UI** | Tenants can't currently see their own access log. HIPAA Privacy Rule gives patients rights to an accounting of disclosures. | `/dashboard/admin/audit-log` page (admin role) showing `chat_access_audit` rows. |
| **Data subject export** | No mechanism to export "everything we have about patient X" if requested. | `POST /api/admin/patient-export` returning JSON of all their records. |
| **Breach notification runbook** | No documented process for "if something leaks, what happens." | Written runbook: detect → contain → notify tenant → notify affected patients → notify HHS if >500 records. |

### Lower-priority hardening

| Gap | Description | Fix |
|---|---|---|
| **Redundant tenant_id check on `chat_messages` RLS** | Current policy relies transitively on `chat_conversations` ownership. A server-side bug writing a mismatched `tenant_id` wouldn't be caught by RLS. | Small migration adding explicit `tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())` to the policy. |
| **Silent summary regen skip on webhook** | If the client-profile lookup errors in `/api/vapi/webhook` end-of-call handler, we skip `regenerateClientSummary` without logging. | Add `CLIENT_REGEN_LOOKUP_FAILED` log line. |
| **Implicit policy intent on `chat_feedback`** | `FOR ALL` policy allows direct-from-browser inserts if a future dev wires that path. Today the server handles all writes via service role. | Add a comment or split into explicit `FOR SELECT/UPDATE/DELETE` to force future inserts through the server. |
| **Encryption at rest review** | Supabase default is AES-256 for row-level data. Worth confirming under our Enterprise agreement. | Document in BAA review. |
| **Encryption in transit** | HTTPS everywhere via Vercel edge. No known gaps. Confirm Vapi → our webhook uses TLS 1.2+. | Verify during Vapi BAA review. |
| **No MFA enforcement for tenant staff** | Supabase auth supports TOTP but we don't require it. | Enable + require MFA for `tenant_users` with `role = 'owner' | 'admin'`. |
| **Rate limiting** | No per-tenant rate limiting on API routes. One tenant's abuse could affect another's latency. | Add Upstash/Vercel rate-limit middleware. |

---

## Before accepting real PHI — checklist

Do not accept a production tenant with real patient data until all of these are green.

### Legal / vendor
- [ ] **OpenAI BAA** signed + Zero Data Retention enabled for our account
- [ ] **Supabase Enterprise** contracted + BAA signed
- [ ] **Vercel Enterprise** contracted + BAA signed
- [ ] **Vapi BAA** signed (confirm coverage of call audio + transcripts)
- [ ] **Twilio BAA** signed (SMS path)
- [ ] **ElevenLabs BAA** — lower priority, only if samples become personalized

### Engineering
- [ ] Log drain configured to a BAA-covered log service (Axiom / Datadog / BetterStack)
- [ ] Alert rule: `HIPAA_AUDIT_WRITE_FAILED` → page on-call
- [ ] Audit-table tamper protection (trigger OR append-only mirror)
- [ ] Retention policy documented + automated (cleanup job or archival)
- [ ] Tenant audit-log UI for owner/admin role
- [ ] Subject-export endpoint
- [ ] MFA enforced for tenant owner/admin roles
- [ ] Rate limiting per tenant
- [ ] `chat_messages` RLS hardened with explicit tenant check
- [ ] `chat_feedback` RLS intent documented

### Operational
- [ ] Breach notification runbook written and drilled
- [ ] Incident response contact list (who to call, in what order)
- [ ] Security policy doc for staff (password hygiene, device encryption, etc.)
- [ ] Annual HIPAA training for anyone with prod DB access
- [ ] External security review / pen test before first paying tenant

---

## Operational runbook (current state)

### When `HIPAA_AUDIT_WRITE_FAILED` appears in logs

1. Check Supabase dashboard for current connection status / alerts
2. Check which table (`chat_access_audit`) and identify the tenant/user from the log payload
3. If transient (Supabase was degraded): no action; rows for that window are lost
4. If systemic (schema drift, broken migration): fix immediately, then backfill audit rows if possible from `chat_messages.metadata.sources` (chat) or `chat_conversations.client_profile_id` (brief)
5. Document the incident in an internal log for future compliance reviews

### When a tenant reports "someone saw my client's data who shouldn't have"

1. Query `chat_access_audit` for the `client_profile_id` in the time window
2. Verify RLS was not bypassed (should never happen; if it did, escalate to engineering)
3. Review `client_profile_updates` for the same client — any unauthorized edits?
4. If confirmed breach: follow breach notification runbook (pending — see checklist)

### When adding a new feature that touches client data

1. Does the feature read `client_profiles`, `call_logs`, `calendar_events`, or `chat_*`? If yes → PHI path.
2. Does it scope queries on `tenant_id`? Required.
3. Does it write a `chat_access_audit` row when displaying data? Required for tenant-facing read paths.
4. Does it pass data to a vendor (OpenAI, Vapi, Twilio, ElevenLabs)? Verify BAA covers the specific data shape.
5. Test adversarially: tenant A request with a tenant-B `client_profile_id` → must return 404, not data.

---

## Last reviewed

2026-04-22 — initial draft. Review quarterly or on any PHI-adjacent architectural change.
