"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <Hero />
      <Logos />
      <Stats />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <DemoSection />
      <Footer />
    </div>
  );
}

/* ── Navigation ─────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-lg border-b border-gray-100 shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="nav-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="100%" stopColor="#4f46e5"/>
              </linearGradient>
            </defs>
            <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#nav-grad)"/>
            <rect x="8" y="5"  width="5" height="22" rx="2.5" fill="url(#nav-grad)"/>
            <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#nav-grad)"/>
            <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#nav-grad)"/>
          </svg>
          <span className="text-lg font-semibold tracking-tight">
            <span className={`font-bold transition-colors duration-300 ${scrolled ? "text-gray-900" : "text-white drop-shadow-sm"}`}>Vaux</span>
            <span className={`transition-colors duration-300 ${scrolled ? "text-violet-500" : "text-violet-300"}`}>Voice</span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm">
          {["How It Works", "Features", "Pricing"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/ /g, "-")}`}
              className={`font-medium transition-colors duration-300 ${scrolled ? "text-gray-600 hover:text-gray-900" : "text-white/80 hover:text-white"}`}
            >
              {label}
            </a>
          ))}
          <Link
            href="/book-a-demo"
            className={`px-4 py-2 rounded-lg transition-all duration-300 font-semibold text-sm ${
              scrolled
                ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
                : "bg-white text-gray-900 hover:bg-gray-50 shadow-md"
            }`}
          >
            Request Demo
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero ────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative pt-32 pb-24 px-6 overflow-hidden min-h-[640px] flex items-center">
      <video
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        src="/hero-video.mp4"
      />
      {/* Layered overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-950/75 via-gray-900/60 to-violet-950/70" />
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(139,92,246,0.25),transparent)]" />

      <div className="relative z-10 max-w-4xl mx-auto text-center w-full">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full text-sm text-white/90 mb-8 backdrop-blur-sm">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
          Now handling 50,000+ calls per month
        </div>
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.06] tracking-tight mb-6 text-white">
          Your med spa&apos;s AI
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
            receptionist
          </span>
        </h1>
        <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          Never miss a call, never lose a lead. Our AI answers 24/7, knows your
          services and pricing, and books appointments — so your team can focus
          on what matters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/book-a-demo"
            className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold text-base hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-900/40 hover:shadow-violet-800/50 hover:-translate-y-0.5"
          >
            Get Started Free →
          </Link>
          <a
            href="tel:+14783752044"
            className="px-8 py-3.5 bg-white/10 text-white border border-white/25 rounded-xl font-medium text-base hover:bg-white/20 transition-all backdrop-blur-sm"
          >
            Try a Live Demo Call
          </a>
        </div>
        <p className="text-sm text-gray-500 mt-5">No credit card required · Live in under 48 hours</p>
      </div>
    </section>
  );
}

/* ── Social proof logos ──────────────────────────────────────────── */
function Logos() {
  const names = ["Glow Aesthetics", "Radiance MD", "BeautyFix", "Skin Studio", "AuraClinic"];
  return (
    <section className="py-12 border-y border-gray-100 bg-gray-50/60">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-8">
          Trusted by leading med spas nationwide
        </p>
        <div className="flex items-center justify-center gap-10 md:gap-16 flex-wrap">
          {names.map((name) => (
            <span key={name} className="text-sm font-bold text-gray-300 tracking-wide whitespace-nowrap select-none">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Stats ───────────────────────────────────────────────────────── */
function Stats() {
  const stats = [
    { value: "98%", label: "Call answer rate" },
    { value: "<1s", label: "Response time" },
    { value: "40%", label: "More bookings" },
    { value: "24/7", label: "Availability" },
  ];
  return (
    <section className="py-0">
      <div className="bg-gradient-to-r from-violet-700 via-indigo-700 to-violet-800 relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/20">
          {stats.map((s, i) => (
            <div key={s.label} className={`text-center ${i > 0 ? "pl-8" : ""}`}>
              <p className="text-4xl md:text-5xl font-bold text-white tracking-tight">{s.value}</p>
              <p className="text-sm font-medium text-violet-200 mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Share your business info",
      desc: "Send us your services, pricing, policies, and FAQs. We handle all the setup — no technical work on your end.",
    },
    {
      num: "02",
      title: "We configure your AI",
      desc: "Your AI receptionist is trained on your specific business. Custom voice, custom greeting, complete knowledge of your offerings.",
    },
    {
      num: "03",
      title: "Go live in 48 hours",
      desc: "Get a dedicated phone number or forward your existing line. Start answering every call, every time.",
    },
  ];
  return (
    <section id="how-it-works" className="py-24 bg-gray-50">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-bold text-violet-600 uppercase tracking-widest bg-violet-50 border border-violet-100 px-3 py-1 rounded-full mb-4">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Live in three simple steps</h2>
        </div>
        <div className="relative grid md:grid-cols-3 gap-8">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-10 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-violet-200 via-indigo-200 to-violet-200 z-0" />
          {steps.map((s) => (
            <div key={s.num} className="relative bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-100 transition-all z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-5 shadow-md shadow-violet-200">
                <span className="text-sm font-bold text-white">{s.num}</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{s.title}</h3>
              <p className="text-gray-500 leading-relaxed text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Feature SVG icons ───────────────────────────────────────────── */
const FEAT_GRAD_ID = "fg";
function FeatGrad() {
  return (
    <defs>
      <linearGradient id={FEAT_GRAD_ID} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c3aed"/>
        <stop offset="100%" stopColor="#4f46e5"/>
      </linearGradient>
    </defs>
  );
}
function FeatIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={`url(#${FEAT_GRAD_ID})`} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <FeatGrad />{children}
    </svg>
  );
}

/* ── Features ────────────────────────────────────────────────────── */
function Features() {
  const features = [
    {
      icon: <FeatIcon><path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6.5-6 7.4V18h-2v-1.6C7.5 15.5 5 12.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/><path d="M10 17v4"/><path d="M14 17v4"/></FeatIcon>,
      title: "Deep Business Knowledge",
      desc: "Trained on your exact services, pricing, packages, and policies. Answers questions like your best employee would.",
    },
    {
      icon: <FeatIcon><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></FeatIcon>,
      title: "Appointment Booking",
      desc: "Collects patient info and schedules appointments directly. Integrates with your existing booking system.",
    },
    {
      icon: <FeatIcon><path d="M2 12c1.5-3 3-4.5 4.5-4.5S9 9 10.5 12s3 4.5 4.5 4.5S18 15 19.5 12 21 7.5 22 7.5"/></FeatIcon>,
      title: "Natural Human Voice",
      desc: "Powered by ElevenLabs — callers can't tell it's AI. Choose from multiple voice profiles that match your brand.",
    },
    {
      icon: <FeatIcon><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/></FeatIcon>,
      title: "Real-Time Dashboard",
      desc: "See every call, transcript, and outcome. Track missed calls, peak hours, and conversion rates.",
    },
    {
      icon: <FeatIcon><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7z"/><path d="M9 12l2 2 4-4"/></FeatIcon>,
      title: "HIPAA Considerations",
      desc: "Built with healthcare privacy in mind. No sensitive patient data stored. SOC 2 compliance roadmap.",
    },
    {
      icon: <FeatIcon><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></FeatIcon>,
      title: "Instant Scalability",
      desc: "Handle 1 call or 1,000 simultaneous calls. No hold times, no voicemail — every caller gets answered.",
    },
    {
      icon: <FeatIcon><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V7L6 11H4a1 1 0 0 0-1 1z"/><path d="M19 9c1.5 1 1.5 5 0 6"/><path d="M17 7c2.5 1.5 2.5 8.5 0 10"/></FeatIcon>,
      title: "Proactive Outbound Campaigns",
      desc: "Automatically reach out to patients for reminders, reactivation campaigns, and promotions via AI-powered calls and SMS.",
    },
    {
      icon: <FeatIcon><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/><path d="M10 15h4"/></FeatIcon>,
      title: "Billing & Payment Support",
      desc: "AI handles billing questions, shares payment options, and sends payment links — so no revenue slips through the cracks.",
    },
    {
      icon: <FeatIcon><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M10.5 8h3"/><path d="M9.5 10l2 6"/><path d="M14.5 10l-2 6"/></FeatIcon>,
      title: "Referral Management",
      desc: "Track referral sources, reward loyal patients automatically, and grow your practice through word-of-mouth.",
    },
  ];
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-bold text-violet-600 uppercase tracking-widest bg-violet-50 border border-violet-100 px-3 py-1 rounded-full mb-4">
            Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Everything your front desk does.<br />
            <span className="text-gray-400">Without the front desk.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl bg-white border border-gray-100 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-50 transition-all duration-200"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 flex items-center justify-center mb-4 group-hover:from-violet-100 group-hover:to-indigo-100 transition-colors">
                {f.icon}
              </div>
              <h3 className="font-semibold text-base mb-2 text-gray-900">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Star rating ─────────────────────────────────────────────────── */
function Stars() {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" className="shrink-0">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

/* ── Testimonials ────────────────────────────────────────────────── */
function Testimonials() {
  const quotes = [
    {
      text: "We were losing 30% of our calls to voicemail. Now every single call gets answered. Our bookings are up 40% in two months.",
      name: "Dr. Sarah Chen",
      role: "Owner, Radiance Medical Spa",
      initials: "SC",
    },
    {
      text: "The AI knows our service menu better than some of our staff. Patients love that they get instant answers at 9pm on a Saturday.",
      name: "Jennifer Martinez",
      role: "Practice Manager, Glow Aesthetics",
      initials: "JM",
    },
    {
      text: "Setup was painless. We sent our service list and pricing, and 48 hours later we had a fully trained AI receptionist.",
      name: "Michael Torres",
      role: "Owner, Skin Studio LA",
      initials: "MT",
    },
  ];
  return (
    <section className="py-24 bg-gradient-to-b from-violet-50/60 to-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-bold text-violet-600 uppercase tracking-widest bg-violet-50 border border-violet-100 px-3 py-1 rounded-full mb-4">
            Testimonials
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Loved by med spa owners</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map((q) => (
            <div key={q.name} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-100 transition-all">
              <Stars />
              <p className="text-gray-700 leading-relaxed mb-6 text-sm">{q.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">{q.initials}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">{q.name}</p>
                  <p className="text-gray-400 text-xs">{q.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────── */
function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-bold text-violet-600 uppercase tracking-widest bg-violet-50 border border-violet-100 px-3 py-1 rounded-full mb-4">
            Pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Simple, transparent pricing</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Less than the cost of a part-time receptionist. Cancel anytime.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-start">
          <PricingCard
            name="Starter"
            price="$199"
            desc="For single-location med spas"
            features={[
              "1 phone number",
              "Up to 500 calls/mo",
              "Custom knowledge base",
              "Call dashboard",
              "Email support",
              "Billing FAQ support",
            ]}
          />
          <PricingCard
            name="Growth"
            price="$499"
            desc="For growing practices"
            features={[
              "Up to 3 phone numbers",
              "Unlimited calls",
              "Appointment booking integration",
              "Call transcripts & analytics",
              "Priority support",
              "SMS follow-up",
              "Outbound reminder campaigns",
              "Referral tracking",
            ]}
            featured
          />
          <PricingCard
            name="Enterprise"
            price="Custom"
            desc="For multi-location groups"
            features={[
              "Unlimited numbers",
              "Unlimited calls",
              "Custom integrations",
              "Dedicated account manager",
              "White-label options",
              "SLA guarantee",
              "Custom outbound campaigns",
              "Advanced referral analytics",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  name, price, desc, features, featured,
}: {
  name: string; price: string; desc: string; features: string[]; featured?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl p-8 border transition-all ${
      featured
        ? "border-violet-400 bg-gradient-to-b from-violet-600 to-indigo-700 shadow-2xl shadow-violet-200 -mt-4 pb-12"
        : "bg-white border-gray-200 hover:border-violet-200 hover:shadow-md"
    }`}>
      {featured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap">
            Most Popular
          </span>
        </div>
      )}
      <p className={`font-bold text-lg ${featured ? "text-white" : "text-gray-900"}`}>{name}</p>
      <div className="mt-3 mb-1 flex items-end gap-1">
        <span className={`text-5xl font-extrabold tracking-tight ${featured ? "text-white" : "text-gray-900"}`}>{price}</span>
        {price !== "Custom" && <span className={`text-sm mb-2 ${featured ? "text-violet-200" : "text-gray-400"}`}>/month</span>}
      </div>
      <p className={`text-sm mb-6 ${featured ? "text-violet-200" : "text-gray-500"}`}>{desc}</p>
      <Link
        href="/book-a-demo"
        className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all mb-7 ${
          featured
            ? "bg-white text-violet-700 hover:bg-gray-50 shadow-md"
            : "bg-gray-900 text-white hover:bg-gray-800"
        }`}
      >
        {price === "Custom" ? "Contact Sales" : "Start Free Trial"}
      </Link>
      <ul className="space-y-3">
        {features.map((f) => (
          <li key={f} className={`text-sm flex items-start gap-2.5 ${featured ? "text-violet-100" : "text-gray-600"}`}>
            <svg className={`w-4 h-4 shrink-0 mt-0.5 ${featured ? "text-violet-300" : "text-violet-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Demo CTA ────────────────────────────────────────────────────── */
function DemoSection() {
  return (
    <section id="demo" className="py-24 bg-gray-950 relative overflow-hidden">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(139,92,246,0.2),transparent)]" />
      <div className="relative max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to never miss a call again?
          </h2>
          <p className="text-gray-400 text-lg">
            Get a personalized demo for your med spa. We&apos;ll have your AI receptionist ready in 48 hours.
          </p>
        </div>
        <DemoForm />
      </div>
    </section>
  );
}

function DemoForm() {
  const [form, setForm] = useState({ name: "", email: "", business_name: "", phone: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setStatus("success");
      setForm({ name: "", email: "", business_name: "", phone: "" });
    } else {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-gray-900 rounded-2xl p-10 text-center border border-gray-800">
        <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">You&apos;re on the list!</h3>
        <p className="text-gray-400">We&apos;ll reach out within 24 hours to schedule your personalized demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 md:p-10 border border-gray-800 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { label: "Your Name", key: "name", type: "text", placeholder: "Jane Smith", required: true },
          { label: "Email", key: "email", type: "email", placeholder: "jane@medspa.com", required: true },
          { label: "Med Spa Name", key: "business_name", type: "text", placeholder: "Radiance Med Spa", required: true },
          { label: "Phone (optional)", key: "phone", type: "tel", placeholder: "(555) 000-0000", required: false },
        ].map(({ label, key, type, placeholder, required }) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
            <input
              type={type}
              required={required}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm transition-colors"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 transition-all text-base mt-2 shadow-lg shadow-violet-900/30"
      >
        {status === "loading" ? "Submitting..." : "Request Your Free Demo →"}
      </button>
      {status === "error" && (
        <p className="text-red-400 text-sm text-center">Something went wrong. Please try again.</p>
      )}
      <p className="text-gray-600 text-xs text-center">No commitment · Free trial available · Setup in 48 hours</p>
    </form>
  );
}

/* ── Footer ──────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-gray-100 py-12 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="footer-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7c3aed"/>
                  <stop offset="100%" stopColor="#4f46e5"/>
                </linearGradient>
              </defs>
              <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#footer-grad)"/>
              <rect x="8" y="5"  width="5" height="22" rx="2.5" fill="url(#footer-grad)"/>
              <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#footer-grad)"/>
              <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#footer-grad)"/>
            </svg>
            <span className="font-semibold tracking-tight text-base">
              <span className="font-bold text-gray-900">Vaux</span><span className="text-violet-500">Voice</span>
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-700 transition-colors">Terms of Service</a>
            <a href="mailto:hello@vauxvoice.com" className="hover:text-gray-700 transition-colors">Contact</a>
          </div>
          <p className="text-sm text-gray-400">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
