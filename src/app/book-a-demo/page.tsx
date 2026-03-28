"use client";

import { useState } from "react";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────────── */
/*  Types                                                           */
/* ─────────────────────────────────────────────────────────────── */

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessName: string;
  city: string;
  state: string;
  callVolume: string;
  biggestChallenge: string;
  hearAboutUs: string;
}

const INITIAL_FORM: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  businessName: "",
  city: "",
  state: "",
  callVolume: "",
  biggestChallenge: "",
  hearAboutUs: "",
};

/* ─────────────────────────────────────────────────────────────── */
/*  Page                                                            */
/* ─────────────────────────────────────────────────────────────── */

export default function BookADemoPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">V</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">VauxVoice</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">
              How It Works
            </Link>
            <Link href="/#features" className="text-gray-600 hover:text-gray-900 transition-colors">
              Features
            </Link>
            <Link href="/#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">
              Pricing
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + Two-column layout */}
      <main className="pt-16">
        {/* Two-column section */}
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Left column — value proposition */}
            <LeftColumn />
            {/* Right column — multi-step form */}
            <div>
              <MultiStepForm />
            </div>
          </div>
        </div>

        {/* FAQ — full width */}
        <FAQSection />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">V</span>
            </div>
            <span className="font-semibold text-gray-700 tracking-tight">VauxVoice</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-700 transition-colors">Terms of Service</a>
            <a href="mailto:hello@vauxvoice.com" className="hover:text-gray-700 transition-colors">Contact</a>
          </div>
          <p>© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Left column                                                     */
/* ─────────────────────────────────────────────────────────────── */

const BENEFITS = [
  "Live demo call to a real AI receptionist",
  "Custom setup walkthrough for your med spa",
  "Pricing tailored to your call volume",
  "Q&A with our team",
  "Go live in 48 hours if you&apos;re ready",
];

const TESTIMONIALS = [
  {
    quote:
      "We stopped losing after-hours leads overnight. VauxVoice answered our first call at 11 PM and booked two appointments.",
    name: "Dr. Sarah Chen",
    role: "Owner, Radiance Medical Spa",
  },
  {
    quote:
      "Our front desk finally has time to focus on clients in the room. The AI handles the phones like a pro.",
    name: "Jennifer Martinez",
    role: "Practice Manager, Glow Aesthetics",
  },
  {
    quote:
      "Setup took less than 48 hours. I honestly didn't believe it would work this well.",
    name: "Michael Torres",
    role: "Owner, Skin Studio LA",
  },
];

function LeftColumn() {
  return (
    <div className="bg-gray-900 rounded-3xl p-10 lg:p-12 text-white sticky top-24">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded-full text-sm text-violet-300 mb-8">
        <span className="w-2 h-2 bg-violet-400 rounded-full" />
        Free 30-min demo
      </div>

      {/* Heading */}
      <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
        See VauxVoice{" "}
        <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          in action
        </span>
      </h1>
      <p className="text-gray-400 text-base leading-relaxed mb-10">
        Book a personalized demo and we&apos;ll show you exactly how your AI
        receptionist will handle real calls for your med spa.
      </p>

      {/* Benefits list */}
      <div className="mb-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          What you&apos;ll get
        </p>
        <ul className="space-y-3">
          {[
            "Live demo call to a real AI receptionist",
            "Custom setup walkthrough for your med spa",
            "Pricing tailored to your call volume",
            "Q&A with our team",
            "Go live in 48 hours if you're ready",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                ✓
              </span>
              <span className="text-gray-300">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Social proof */}
      <div className="border-t border-gray-800 pt-8">
        <p className="text-sm text-gray-400 mb-6">
          Join{" "}
          <span className="font-semibold text-white">50+ med spas</span>{" "}
          already using VauxVoice
        </p>
        <div className="space-y-5">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-300 text-sm leading-relaxed mb-3 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="text-white text-xs font-semibold">{t.name}</p>
                <p className="text-gray-500 text-xs">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Multi-step form                                                 */
/* ─────────────────────────────────────────────────────────────── */

function MultiStepForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const totalSteps = 3;

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setStatus("loading");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email,
          business_name: form.businessName,
          phone: form.phone || undefined,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setStep(3);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 shadow-lg p-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {step === 1 && "Your contact info"}
          {step === 2 && "About your practice"}
          {step === 3 && status === "success" ? "You&apos;re all set!" : step === 3 ? "Almost there!" : ""}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Step {Math.min(step, totalSteps)} of {totalSteps}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-gray-100 mb-8 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-600 transition-all duration-300"
          style={{ width: `${((Math.min(step, totalSteps)) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Steps */}
      {step === 1 && (
        <StepOne form={form} update={update} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <StepTwo
          form={form}
          update={update}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          status={status}
        />
      )}
      {step === 3 && (
        <StepThree form={form} status={status} />
      )}
    </div>
  );
}

/* ── Step 1 ── */
function StepOne({
  form,
  update,
  onNext,
}: {
  form: FormData;
  update: (f: keyof FormData, v: string) => void;
  onNext: () => void;
}) {
  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <form onSubmit={handleNext} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>First name</label>
          <input
            required
            type="text"
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            className={inputClass}
            placeholder="Jane"
          />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input
            required
            type="text"
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            className={inputClass}
            placeholder="Smith"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Email</label>
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className={inputClass}
          placeholder="jane@medspa.com"
        />
      </div>

      <div>
        <label className={labelClass}>Phone number</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          className={inputClass}
          placeholder="(555) 000-0000"
        />
      </div>

      <div>
        <label className={labelClass}>Business name</label>
        <input
          required
          type="text"
          value={form.businessName}
          onChange={(e) => update("businessName", e.target.value)}
          className={inputClass}
          placeholder="Radiance Med Spa"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>City</label>
          <input
            required
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputClass}
            placeholder="Los Angeles"
          />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input
            required
            type="text"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            className={inputClass}
            placeholder="CA"
            maxLength={2}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors text-sm mt-2"
      >
        Continue →
      </button>

      <p className="text-xs text-center text-gray-400">
        No spam, ever. Your information is safe with us.
      </p>
    </form>
  );
}

/* ── Step 2 ── */
function StepTwo({
  form,
  update,
  onBack,
  onSubmit,
  status,
}: {
  form: FormData;
  update: (f: keyof FormData, v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  status: "idle" | "loading" | "success" | "error";
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  const selectClass =
    "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm bg-white";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelClass}>How many calls do you receive per week?</label>
        <select
          required
          value={form.callVolume}
          onChange={(e) => update("callVolume", e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>Select an option</option>
          <option value="<50">&lt;50 calls/week</option>
          <option value="50-100">50–100 calls/week</option>
          <option value="100-250">100–250 calls/week</option>
          <option value="250+">250+ calls/week</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>What&apos;s your biggest challenge?</label>
        <select
          required
          value={form.biggestChallenge}
          onChange={(e) => update("biggestChallenge", e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>Select an option</option>
          <option value="missing-calls">Missing calls after hours</option>
          <option value="overwhelmed">Front desk overwhelmed</option>
          <option value="slow-booking">Slow booking process</option>
          <option value="no-shows">High no-show rate</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>How did you hear about us?</label>
        <select
          required
          value={form.hearAboutUs}
          onChange={(e) => update("hearAboutUs", e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>Select an option</option>
          <option value="google">Google</option>
          <option value="social">Social media</option>
          <option value="referral">Referral</option>
          <option value="other">Other</option>
        </select>
      </div>

      {status === "error" && (
        <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2">
          Something went wrong. Please try again.
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-500 disabled:opacity-60 transition-colors text-sm"
        >
          {status === "loading" ? "Submitting…" : "Request Demo →"}
        </button>
      </div>

      <p className="text-xs text-center text-gray-400">
        We&apos;ll reach out within 24 hours to schedule your call.
      </p>
    </form>
  );
}

/* ── Step 3 — Confirmation ── */
function StepThree({ form, status }: { form: FormData; status: "idle" | "loading" | "success" | "error" }) {
  if (status !== "success") {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-gray-600">Processing your request…</p>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      {/* Big green checkmark */}
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg
          className="w-9 h-9 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 mb-2">We&apos;ll be in touch!</h3>
      <p className="text-gray-600 text-sm mb-8 max-w-xs mx-auto">
        Our team will reach out within 24 hours to schedule your personalized demo.
      </p>

      {/* Summary card */}
      <div className="bg-gray-50 rounded-xl p-5 text-left text-sm space-y-2 mb-6">
        <p className="font-medium text-gray-900 mb-3">Your submission summary</p>
        <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
        <SummaryRow label="Email" value={form.email} />
        {form.phone && <SummaryRow label="Phone" value={form.phone} />}
        <SummaryRow label="Business" value={form.businessName} />
        <SummaryRow label="Location" value={`${form.city}, ${form.state}`} />
        {form.callVolume && <SummaryRow label="Weekly calls" value={form.callVolume} />}
      </div>

      <Link
        href="/"
        className="text-sm text-violet-600 hover:text-violet-500 font-medium transition-colors"
      >
        ← Back to VauxVoice
      </Link>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  FAQ Section                                                     */
/* ─────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: "What happens in the demo?",
    a: "We walk through a live 30-minute session that includes a real call to our AI receptionist, a full setup walkthrough tailored to your med spa, and a transparent pricing discussion based on your call volume.",
  },
  {
    q: "How quickly can I go live?",
    a: "Most med spas are live within 48 hours of signing up. We handle all the setup — you just share your services, pricing, and a few FAQs.",
  },
  {
    q: "Do I need to switch phone providers?",
    a: "No. We can either forward your existing phone number to our system or provide you with a new dedicated number — whichever works best for your practice.",
  },
  {
    q: "What if I already have a receptionist?",
    a: "VauxVoice works alongside your team. It handles after-hours calls, overflow during busy periods, and routine inquiries — so your staff can focus on in-person clients.",
  },
  {
    q: "Is there a contract?",
    a: "No contracts. You can cancel anytime, no questions asked. We earn your business month to month.",
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="text-3xl font-bold text-gray-900">Common questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900 text-sm">{faq.q}</span>
                <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center transition-transform ${open === i ? "rotate-45 border-violet-500" : ""}`}>
                  <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16M4 12h16" />
                  </svg>
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
