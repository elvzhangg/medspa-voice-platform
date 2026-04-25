-- ─── Demo Tenant: Glow Med Spa ───────────────────────────────────────────────
-- Run this after migrations to seed a demo tenant for testing

insert into tenants (id, name, slug, phone_number, voice_id, greeting_message, business_hours)
values (
  '00000000-0000-0000-0000-000000000001',
  'Glow Med Spa',
  'glow-med-spa',
  '+15550001234',  -- Replace with actual Vapi phone number
  'rachel',
  'Thanks so much for calling Glow Med Spa! Hope you''re having a great day — how can I help?',
  '{
    "monday":    {"open": "09:00", "close": "18:00"},
    "tuesday":   {"open": "09:00", "close": "18:00"},
    "wednesday": {"open": "09:00", "close": "18:00"},
    "thursday":  {"open": "09:00", "close": "20:00"},
    "friday":    {"open": "09:00", "close": "18:00"},
    "saturday":  {"open": "10:00", "close": "16:00"},
    "sunday":    null
  }'
)
on conflict (slug) do nothing;

-- ─── Knowledge Base Documents ─────────────────────────────────────────────────
-- Note: embeddings are generated at runtime via the API; insert content only here

insert into knowledge_base_documents (tenant_id, title, content, category) values

-- SERVICES
('00000000-0000-0000-0000-000000000001',
 'Injectable Services',
 'Botox/Dysport: $12–$14 per unit. Most areas require 20–50 units. Popular areas include forehead lines, frown lines (11s), crow''s feet, lip flip, and brow lift. Results last 3–4 months.

Dermal Fillers: Starting at $650 per syringe. We offer Juvederm, Restylane, and Sculptra. Popular areas: lips, cheeks, nasolabial folds, under-eyes (tear troughs), jawline, and chin. Results last 12–24 months depending on product.',
 'services'),

('00000000-0000-0000-0000-000000000001',
 'Laser & Energy Treatments',
 'Laser Hair Removal: Starting at $75 per session. Package discounts available (6-session packages save 20%). Treatment areas: legs, underarms, bikini, face, back, chest. Requires 6–8 sessions for optimal results.

IPL Photofacial: $250 per session. Treats sun damage, redness, and uneven skin tone. 3-session packages available for $650.

Morpheus8 (RF Microneedling): $800 per session. Tightens skin, reduces wrinkles and acne scars. Face, neck, or body. Series of 3 recommended.',
 'services'),

('00000000-0000-0000-0000-000000000001',
 'Skin & Body Treatments',
 'HydraFacial: $150 (30 min) or $200 (45 min with booster). Deeply cleanses, extracts, and hydrates. Suitable for all skin types. Monthly maintenance recommended.

Chemical Peels: $100–$300 depending on depth. Superficial, medium, and deep options. Treats acne, pigmentation, and fine lines.

Body Contouring (CoolSculpting): Starting at $750 per area. Non-surgical fat reduction. Results visible in 1–3 months. Multiple areas can be treated in one session.',
 'services'),

('00000000-0000-0000-0000-000000000001',
 'IV Therapy & Wellness',
 'IV Vitamin Drips: $150–$350 depending on formula. Popular options: Myers Cocktail, Glutathione Glow, Hydration Boost, Immunity Shield. Sessions take 45–60 minutes. Walk-ins welcome for wellness drips.',
 'services'),

-- PRICING
('00000000-0000-0000-0000-000000000001',
 'Pricing Overview & Specials',
 'Current promotions:
- New patient special: 20% off first treatment
- Botox Tuesday: $10/unit every Tuesday (regularly $12)
- Monthly membership: $199/month includes one HydraFacial + 10% off all other services
- Refer a friend: Both you and your friend get $50 credit

Financing available through CareCredit and Cherry. No interest plans for 6–12 months.',
 'pricing'),

-- POLICIES
('00000000-0000-0000-0000-000000000001',
 'Appointment & Cancellation Policy',
 'Booking: Appointments can be booked by phone, online at glowmedspa.com, or through our app.

Cancellation: We require 24-hour notice for cancellations. Late cancellations (under 24 hours) incur a $50 fee. No-shows are charged the full service fee.

Deposits: Treatments over $500 require a 20% deposit at booking, applied to your total.

Late arrivals: If you arrive more than 15 minutes late, we may need to reschedule.',
 'policies'),

('00000000-0000-0000-0000-000000000001',
 'Medical & Safety Policies',
 'Consultations: All new patients receive a complimentary 15-minute consultation before any injectable or laser treatment.

Contraindications: Injectables are not recommended during pregnancy or breastfeeding. Please disclose all medications, especially blood thinners, at your consultation.

Age requirement: Must be 18+ for injectables and laser treatments. 16–17 with parental consent for certain skin treatments.

Touch-ups: Botox touch-ups are complimentary within 2 weeks if results are asymmetrical. Filler touch-ups assessed case by case.',
 'policies'),

-- FAQ
('00000000-0000-0000-0000-000000000001',
 'Frequently Asked Questions',
 'Q: Does Botox hurt?
A: Most patients describe it as a small pinch. We use fine needles and can apply numbing cream upon request.

Q: How long do results last?
A: Botox: 3–4 months. Fillers: 12–24 months. Laser hair removal: permanent after full course. HydraFacial results last 4–6 weeks.

Q: Do I need a consultation first?
A: Yes, all new patients need a consultation before injectables or laser treatments. It''s complimentary and takes about 15 minutes.

Q: Can I combine treatments?
A: Yes! Many patients combine Botox with filler or a HydraFacial on the same visit. Our team will advise what''s safe to combine.

Q: Do you offer payment plans?
A: Yes, we accept CareCredit and Cherry financing with 0% interest plans.',
 'faq'),

('00000000-0000-0000-0000-000000000001',
 'Location & Contact',
 'Address: 123 Wellness Blvd, Suite 200, San Francisco, CA 94105
Phone: (555) 000-1234
Email: hello@glowmedspa.com
Website: glowmedspa.com

Hours:
Monday–Wednesday: 9 AM – 6 PM
Thursday: 9 AM – 8 PM
Friday: 9 AM – 6 PM
Saturday: 10 AM – 4 PM
Sunday: Closed

Parking: Validated parking available in the building garage. Street parking on Wellness Blvd.',
 'general');
