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
      className={`fixed top-0 w-full border-b z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-lg border-gray-100"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          {/* Dark logo (shown when scrolled — white bg) */}
          <img
            src="/logo.svg"
            alt="VauxVoice"
            width={160}
            height={40}
            className={`h-8 w-auto transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0 absolute"}`}
          />
          {/* Light logo (shown when not scrolled — dark/transparent bg) */}
          <img
            src="/logo-light.svg"
            alt="VauxVoice"
            width={160}
            height={40}
            className={`h-8 w-auto transition-opacity duration-300 ${scrolled ? "opacity-0 absolute" : "opacity-100"}`}
          />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm">
          <a
            href="#how-it-works"
            className={`transition-colors duration-300 ${scrolled ? "text-gray-600 hover:text-gray-900" : "text-white hover:text-gray-200"}`}
          >
            How It Works
          </a>
          <a
            href="#features"
            className={`transition-colors duration-300 ${scrolled ? "text-gray-600 hover:text-gray-900" : "text-white hover:text-gray-200"}`}
          >
            Features
          </a>
          <a
            href="#pricing"
            className={`transition-colors duration-300 ${scrolled ? "text-gray-600 hover:text-gray-900" : "text-white hover:text-gray-200"}`}
          >
            Pricing
          </a>
          <Link
            href="/book-a-demo"
            className={`px-4 py-2 rounded-lg transition-colors duration-300 font-medium ${
              scrolled
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-white text-gray-900 hover:bg-gray-100"
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
    <section className="relative pt-32 pb-20 px-6 overflow-hidden min-h-[600px] flex items-center">
      {/* Animated gradient background — video can be swapped in at /public/hero-video.mp4 */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-gray-900 to-indigo-950" />
      {/* Animated orbs for depth */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gray-900/20" />
      {/* Content on top */}
      <div className="relative z-10 max-w-4xl mx-auto text-center w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full text-sm text-white mb-8">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
          Now handling 50,000+ calls per month
        </div>
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight mb-6 text-white">
          Your med spa&apos;s AI
          <br />
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            receptionist
          </span>
        </h1>
        <p className="text-xl text-gray-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          Never miss a call, never lose a lead. Our AI answers 24/7, knows your
          services and pricing, and books appointments — so your team can focus
          on what matters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/book-a-demo"
            className="px-8 py-3.5 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors font-medium text-base"
          >
            Get Started Free →
          </Link>
          <a
            href="tel:+14783752044"
            className="px-8 py-3.5 bg-white/10 text-white border border-white/20 rounded-xl hover:bg-white/20 transition-colors font-medium text-base"
          >
            📞 Try a Live Demo Call
          </a>
        </div>
        <p className="text-sm text-gray-400 mt-4">No credit card required · Live in under 48 hours</p>
      </div>
    </section>
  );
}

/* ── Social proof logos ──────────────────────────────────────────── */
function Logos() {
  return (
    <section className="py-12 border-y border-gray-100 bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-center text-sm text-gray-400 uppercase tracking-widest mb-8">
          Trusted by leading med spas nationwide
        </p>
        <div className="flex items-center justify-center gap-12 md:gap-16 opacity-40 flex-wrap">
          {["Glow Aesthetics", "Radiance MD", "BeautyFix", "Skin Studio", "AuraClinic"].map((name) => (
            <span key={name} className="text-lg font-semibold text-gray-600 whitespace-nowrap">{name}</span>
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
    <section className="py-16">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              {s.value}
            </p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
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
    <section id="how-it-works" className="py-20 bg-gray-50">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-violet-600 uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl md:text-4xl font-bold">Live in three simple steps</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.num} className="bg-white rounded-2xl p-8 border border-gray-100">
              <span className="text-sm font-mono text-violet-600 font-bold">{s.num}</span>
              <h3 className="text-xl font-semibold mt-3 mb-2">{s.title}</h3>
              <p className="text-gray-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Features ────────────────────────────────────────────────────── */
function Features() {
  const features = [
    {
      icon: "🧠",
      title: "Deep Business Knowledge",
      desc: "Trained on your exact services, pricing, packages, and policies. Answers questions like your best employee would.",
    },
    {
      icon: "📅",
      title: "Appointment Booking",
      desc: "Collects patient info and schedules appointments directly. Integrates with your existing booking system.",
    },
    {
      icon: "🎙️",
      title: "Natural Human Voice",
      desc: "Powered by ElevenLabs — callers can't tell it's AI. Choose from multiple voice profiles that match your brand.",
    },
    {
      icon: "📊",
      title: "Real-Time Dashboard",
      desc: "See every call, transcript, and outcome. Track missed calls, peak hours, and conversion rates.",
    },
    {
      icon: "🔒",
      title: "HIPAA Considerations",
      desc: "Built with healthcare privacy in mind. No sensitive patient data stored. SOC 2 compliance roadmap.",
    },
    {
      icon: "⚡",
      title: "Instant Scalability",
      desc: "Handle 1 call or 1,000 simultaneous calls. No hold times, no voicemail — every caller gets answered.",
    },
  ];
  return (
    <section id="features" className="py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-violet-600 uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold">Everything your front desk does.<br />Without the front desk.</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Testimonials ────────────────────────────────────────────────── */
function Testimonials() {
  const quotes = [
    {
      text: "We were losing 30% of our calls to voicemail. Now every single call gets answered. Our bookings are up 40% in two months.",
      name: "Dr. Sarah Chen",
      role: "Owner, Radiance Medical Spa",
    },
    {
      text: "The AI knows our service menu better than some of our staff. Patients love that they get instant answers at 9pm on a Saturday.",
      name: "Jennifer Martinez",
      role: "Practice Manager, Glow Aesthetics",
    },
    {
      text: "Setup was painless. We sent our service list and pricing, and 48 hours later we had a fully trained AI receptionist.",
      name: "Michael Torres",
      role: "Owner, Skin Studio LA",
    },
  ];
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-violet-600 uppercase tracking-widest mb-3">Testimonials</p>
          <h2 className="text-3xl md:text-4xl font-bold">Loved by med spa owners</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map((q) => (
            <div key={q.name} className="bg-white rounded-2xl p-8 border border-gray-100">
              <div className="text-violet-500 text-3xl mb-4">&ldquo;</div>
              <p className="text-gray-700 leading-relaxed mb-6">{q.text}</p>
              <div>
                <p className="font-semibold text-sm">{q.name}</p>
                <p className="text-gray-500 text-sm">{q.role}</p>
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
    <section id="pricing" className="py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-violet-600 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold">Simple, transparent pricing</h2>
          <p className="text-gray-600 mt-3 max-w-xl mx-auto">
            Less than the cost of a part-time receptionist. Cancel anytime.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
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
    <div className={`rounded-2xl p-8 border ${featured ? "border-violet-300 bg-violet-50/50 ring-1 ring-violet-200" : "border-gray-100"}`}>
      <p className="font-semibold text-lg">{name}</p>
      <div className="mt-2 mb-1">
        <span className="text-4xl font-bold">{price}</span>
        {price !== "Custom" && <span className="text-gray-500 text-sm">/month</span>}
      </div>
      <p className="text-gray-500 text-sm mb-6">{desc}</p>
      <Link
        href="/book-a-demo"
        className={`block text-center py-2.5 rounded-lg font-medium text-sm transition-colors mb-6 ${
          featured
            ? "bg-gray-900 text-white hover:bg-gray-800"
            : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
        }`}
      >
        {price === "Custom" ? "Contact Sales" : "Start Free Trial"}
      </Link>
      <ul className="space-y-3">
        {features.map((f) => (
          <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
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
    <section id="demo" className="py-20 bg-gray-900">
      <div className="max-w-3xl mx-auto px-6">
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
      <div className="bg-gray-800 rounded-2xl p-10 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-xl font-semibold text-white mb-2">Thank you!</h3>
        <p className="text-gray-400">We&apos;ll reach out within 24 hours to schedule your personalized demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-2xl p-8 md:p-10 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Your Name</label>
          <input
            type="text" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
          <input
            type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="jane@medspa.com"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Med Spa Name</label>
          <input
            type="text" required value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="Radiance Med Spa"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Phone (optional)</label>
          <input
            type="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="(555) 000-0000"
          />
        </div>
      </div>
      <button
        type="submit" disabled={status === "loading"}
        className="w-full py-3.5 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-500 disabled:opacity-50 transition-colors text-base mt-2"
      >
        {status === "loading" ? "Submitting..." : "Request Your Free Demo"}
      </button>
      {status === "error" && (
        <p className="text-red-400 text-sm text-center">Something went wrong. Please try again.</p>
      )}
      <p className="text-gray-500 text-xs text-center">
        No commitment · Free trial available · Setup in 48 hours
      </p>
    </form>
  );
}

/* ── Footer ──────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <img src="/logo.svg" alt="VauxVoice" width={140} height={35} className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-700 transition-colors">Terms of Service</a>
            <a href="mailto:hello@medspavoice.com" className="hover:text-gray-700 transition-colors">Contact</a>
          </div>
          <p className="text-sm text-gray-400">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
