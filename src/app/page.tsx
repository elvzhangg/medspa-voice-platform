"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/* ════════════════════════════════════════════════════════════════════
   Hooks
═══════════════════════════════════════════════════════════════════ */

/** Fires once when element enters viewport. Accepts optional animation class override. */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/** Scroll-position percentage (0–100) */
function useScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? (window.scrollY / max) * 100 : 0);
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return pct;
}

/** Eased integer counter animation. Starts when `enabled` flips true. */
function useCounter(target: number, duration = 1800, enabled = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!enabled || target <= 0) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, target, duration]);
  return val;
}

/** Subtle mouse-tracking 3-D tilt for a card element */
function useTilt(strength = 6) {
  const ref = useRef<HTMLDivElement>(null);
  const restore = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 0.6s cubic-bezier(0.16,1,0.3,1)";
    el.style.transform = "";
    setTimeout(() => { if (ref.current) ref.current.style.transition = ""; }, 600);
  }, []);
  const track = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateX(${-y * strength}deg) rotateY(${x * strength}deg) translateZ(6px)`;
  }, [strength]);
  return { ref, onMouseMove: track, onMouseLeave: restore };
}

/* ════════════════════════════════════════════════════════════════════
   Root
═══════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink-950 text-cream-100 overflow-x-hidden">
      <ScrollProgress />
      <Nav />
      <Hero />
      <LogoMarquee />
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

/* ════════════════════════════════════════════════════════════════════
   Scroll progress bar
═══════════════════════════════════════════════════════════════════ */
function ScrollProgress() {
  const pct = useScrollProgress();
  return <div className="scroll-progress" style={{ width: `${pct}%` }} />;
}

/* ════════════════════════════════════════════════════════════════════
   Navigation
═══════════════════════════════════════════════════════════════════ */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-ink-950/90 backdrop-blur-2xl border-b border-cream-800/30" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="nav-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c4adff"/>
                <stop offset="100%" stopColor="#a085ff"/>
              </linearGradient>
            </defs>
            <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#nav-g)"/>
            <rect x="8" y="5"  width="5" height="22" rx="2.5" fill="url(#nav-g)"/>
            <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#nav-g)"/>
            <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#nav-g)"/>
          </svg>
          <span className="text-lg font-bold tracking-tight text-cream-100 group-hover:text-cream-200 transition-colors">
            Vaux<span className="text-orchid-400">Voice</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-ink-800/60 border border-cream-800/30 backdrop-blur-md">
          {["How It Works", "Features", "Pricing"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/ /g, "-")}`}
              className="px-4 py-1.5 rounded-full text-sm font-medium text-cream-400 hover:text-cream-100 hover:bg-ink-700/60 transition-all duration-200"
            >
              {label}
            </a>
          ))}
        </div>

        <Link
          href="/book-a-demo"
          className="px-5 py-2.5 rounded-full font-semibold text-sm bg-orchid-600 text-cream-100 hover:bg-orchid-500 transition-all shadow-lg shadow-orchid-950/60 hover:shadow-orchid-900/50"
        >
          Request Demo
        </Link>
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hero
═══════════════════════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      {/* Video at reduced opacity */}
      <video
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-[0.18]"
        src="/hero-video.mp4"
      />

      {/* Deep overlay layers */}
      <div className="absolute inset-0 bg-ink-950/80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_30%,rgba(110,63,212,0.2),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_85%_75%,rgba(79,46,180,0.1),transparent)]" />

      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(200,180,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(200,180,255,0.6) 1px,transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Floating orbs with parallax-style animation */}
      <div className="absolute top-[28%] left-[15%] w-[420px] h-[420px] rounded-full bg-orchid-900/20 blur-[120px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[20%] right-[12%] w-[300px] h-[300px] rounded-full bg-orchid-950/30 blur-[90px] pointer-events-none animate-float-mid" style={{ animationDelay: "2.5s" }} />

      <div className="relative z-10 max-w-5xl mx-auto text-center w-full pt-20">
        {/* Badge */}
        <div className="hero-line-1 inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-orchid-900/50 bg-orchid-950/40 backdrop-blur-md text-sm text-orchid-300 mb-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orchid-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orchid-400" />
          </span>
          Now handling 50,000+ calls per month
        </div>

        {/* Headline */}
        <h1 className="hero-line-2 text-[clamp(52px,9vw,92px)] font-extrabold leading-[1.02] tracking-[-0.04em] mb-7 text-cream-100">
          Your med spa&apos;s AI
          <br />
          <span className="gradient-text">receptionist</span>
        </h1>

        {/* Sub */}
        <p className="hero-line-3 text-lg md:text-xl text-cream-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
          Never miss a call, never lose a lead. Our AI answers 24/7, knows your
          services and pricing, and books appointments — so your team can focus
          on what matters.
        </p>

        {/* CTAs */}
        <div className="hero-line-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/book-a-demo"
            className="px-8 py-4 rounded-full font-semibold text-base text-cream-100 bg-orchid-600 hover:bg-orchid-500 transition-all animate-glow-pulse hover:scale-[1.03]"
          >
            Get Started Free →
          </Link>
          <a
            href="tel:+14783752044"
            className="px-8 py-4 rounded-full font-medium text-base text-cream-400 border border-cream-800/50 hover:border-cream-600/50 hover:text-cream-200 hover:bg-ink-800/50 transition-all backdrop-blur-sm"
          >
            Try a Live Demo Call
          </a>
        </div>

        <p className="hero-line-4 text-sm text-cream-600 mt-6 tracking-wide">
          No credit card required · Live in under 48 hours
        </p>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-36 bg-gradient-to-t from-ink-950 to-transparent pointer-events-none" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Logo Marquee
═══════════════════════════════════════════════════════════════════ */
function LogoMarquee() {
  const names = ["Glow Aesthetics", "Radiance MD", "BeautyFix", "Skin Studio", "AuraClinic"];
  const doubled = [...names, ...names];

  return (
    <section className="py-12 border-y border-cream-800/20 bg-ink-900/40 overflow-hidden">
      <p className="text-center text-[10px] font-bold text-cream-600 uppercase tracking-[0.3em] mb-8">
        Trusted by leading med spas nationwide
      </p>
      <div className="relative">
        <div className="flex animate-marquee">
          {doubled.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-10 text-[11px] font-bold text-cream-800 uppercase tracking-[0.22em] whitespace-nowrap px-10"
            >
              {name}
              <span className="text-cream-800/60 text-[8px]">◆</span>
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-ink-900/40 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-ink-900/40 to-transparent pointer-events-none" />
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Stats  (animated counters + scale reveal)
═══════════════════════════════════════════════════════════════════ */
const STATS = [
  { raw: "98%",  num: 98, suffix: "%",  label: "Call answer rate" },
  { raw: "<1s",  num: 0,  suffix: "",   label: "Response time" },
  { raw: "40%",  num: 40, suffix: "%",  label: "More bookings" },
  { raw: "24/7", num: 0,  suffix: "",   label: "Availability" },
];

function StatItem({ raw, num, suffix, label, delay, visible }: {
  raw: string; num: number; suffix: string; label: string; delay: number; visible: boolean;
}) {
  const count   = useCounter(num, 1900, visible && num > 0);
  const display = num > 0 ? `${count}${suffix}` : raw;

  return (
    <div
      className={`reveal-scale ${visible ? "visible" : ""} group text-center py-14 px-8 border-r border-cream-800/20 last:border-r-0`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <p className="text-[clamp(50px,6.5vw,78px)] font-black tracking-tighter leading-none text-cream-100 group-hover:text-orchid-300 transition-colors duration-500">
        {display}
      </p>
      <p className="text-[11px] font-semibold text-cream-600 uppercase tracking-[0.22em] mt-4">
        {label}
      </p>
    </div>
  );
}

function Stats() {
  const { ref, visible } = useReveal(0.25);

  return (
    <section className="bg-ink-950 relative overflow-hidden">
      {/* Thin accent lines */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orchid-600/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-6">
        <div ref={ref} className="grid grid-cols-2 md:grid-cols-4">
          {STATS.map((s, i) => (
            <StatItem key={s.label} {...s} delay={i * 110} visible={visible} />
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cream-800/20 to-transparent" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step card  (extracts hook to top-level component)
═══════════════════════════════════════════════════════════════════ */
function StepCard({ step, index, visible }: {
  step: { num: string; title: string; desc: string };
  index: number;
  visible: boolean;
}) {
  const tilt = useTilt(4);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`reveal-up ${visible ? "visible" : ""} glass tilt rounded-2xl p-8 z-10 relative`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-orchid-600 to-orchid-500/70 flex items-center justify-center mb-6 shadow-lg shadow-orchid-950/50">
        <span className="text-sm font-black text-cream-100">{step.num}</span>
      </div>
      <h3 className="text-lg font-bold mb-3 text-cream-100">{step.title}</h3>
      <p className="text-cream-600 leading-relaxed text-sm">{step.desc}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   How It Works
═══════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  const head  = useReveal();
  const cards = useReveal(0.1);

  const steps = [
    { num: "01", title: "Share your business info",  desc: "Send us your services, pricing, policies, and FAQs. We handle all the setup — no technical work on your end." },
    { num: "02", title: "We configure your AI",      desc: "Your AI receptionist is trained on your specific business. Custom voice, custom greeting, complete knowledge of your offerings." },
    { num: "03", title: "Go live in 48 hours",       desc: "Get a dedicated phone number or forward your existing line. Start answering every call, every time." },
  ];

  return (
    <section id="how-it-works" className="py-32 bg-ink-900/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_80%,rgba(80,40,160,0.08),transparent)]" />

      <div className="max-w-5xl mx-auto px-6 relative">
        {/* Section heading */}
        <div className="text-center mb-24">
          <div ref={head.ref} className={`reveal-blur ${head.visible ? "visible" : ""}`}>
            <span className="inline-block text-[10px] font-bold text-orchid-400 uppercase tracking-[0.3em] border border-orchid-900/50 bg-orchid-950/40 px-4 py-1.5 rounded-full mb-6">
              How It Works
            </span>
          </div>
          {/* Expanding line */}
          <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-orchid-600/40 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
          <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-cream-100 tracking-[-0.03em] leading-tight`}
            style={{ transitionDelay: "80ms" }}>
            Live in three simple steps
          </h2>
        </div>

        <div ref={cards.ref} className="relative grid md:grid-cols-3 gap-5">
          {/* Connector line */}
          <div className={`line-expand hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-orchid-600/30 to-transparent z-0 ${cards.visible ? "visible" : ""}`} />

          {steps.map((s, i) => (
            <StepCard key={s.num} step={s} index={i} visible={cards.visible} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Feature icons
═══════════════════════════════════════════════════════════════════ */
const GID = "fi";
function FG() {
  return (
    <defs>
      <linearGradient id={GID} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#c4adff"/>
        <stop offset="100%" stopColor="#9d7eff"/>
      </linearGradient>
    </defs>
  );
}
function FI({ children }: { children: React.ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={`url(#${GID})`} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <FG />{children}
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Features  (bento grid + tilt + stagger)
═══════════════════════════════════════════════════════════════════ */
const FEATURES = [
  { icon: <FI><path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6.5-6 7.4V18h-2v-1.6C7.5 15.5 5 12.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/><path d="M10 17v4"/><path d="M14 17v4"/></FI>, title: "Deep Business Knowledge", desc: "Trained on your exact services, pricing, packages, and policies. Answers questions like your best employee would.", wide: true },
  { icon: <FI><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></FI>, title: "Appointment Booking", desc: "Collects patient info and schedules appointments directly. Integrates with your existing booking system.", wide: false },
  { icon: <FI><path d="M2 12c1.5-3 3-4.5 4.5-4.5S9 9 10.5 12s3 4.5 4.5 4.5S18 15 19.5 12 21 7.5 22 7.5"/></FI>, title: "Natural Human Voice", desc: "Powered by ElevenLabs — callers can't tell it's AI. Choose from multiple voice profiles that match your brand.", wide: false },
  { icon: <FI><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/></FI>, title: "Real-Time Dashboard", desc: "See every call, transcript, and outcome. Track missed calls, peak hours, and conversion rates.", wide: false },
  { icon: <FI><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7z"/><path d="M9 12l2 2 4-4"/></FI>, title: "HIPAA Considerations", desc: "Built with healthcare privacy in mind. No sensitive patient data stored. SOC 2 compliance roadmap.", wide: false },
  { icon: <FI><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></FI>, title: "Instant Scalability", desc: "Handle 1 call or 1,000 simultaneous calls. No hold times, no voicemail — every caller gets answered.", wide: false },
  { icon: <FI><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V7L6 11H4a1 1 0 0 0-1 1z"/><path d="M19 9c1.5 1 1.5 5 0 6"/><path d="M17 7c2.5 1.5 2.5 8.5 0 10"/></FI>, title: "Proactive Outbound Campaigns", desc: "Automatically reach out to patients for reminders, reactivation campaigns, and promotions via AI-powered calls and SMS.", wide: true },
  { icon: <FI><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/><path d="M10 15h4"/></FI>, title: "Billing & Payment Support", desc: "AI handles billing questions, shares payment options, and sends payment links — so no revenue slips through the cracks.", wide: false },
  { icon: <FI><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M10.5 8h3"/><path d="M9.5 10l2 6"/><path d="M14.5 10l-2 6"/></FI>, title: "Referral Management", desc: "Track referral sources, reward loyal patients automatically, and grow your practice through word-of-mouth.", wide: false },
];

function BentoCard({ f, index, visible, horizontal = false }: {
  f: typeof FEATURES[0]; index: number; visible: boolean; horizontal?: boolean;
}) {
  const tilt = useTilt(4);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`reveal-up ${visible ? "visible" : ""} ${f.wide ? "md:col-span-2" : ""} glass tilt rounded-2xl p-7 group ${horizontal ? "flex gap-6 items-start" : ""}`}
      style={{ transitionDelay: `${index * 55}ms` }}
    >
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-orchid-900/50 bg-orchid-950/50 group-hover:border-orchid-700/50 group-hover:bg-orchid-900/40 transition-all duration-300 ${horizontal ? "" : "mb-4"}`}>
        {f.icon}
      </div>
      <div>
        <h3 className="font-bold text-sm mb-2 text-cream-200 group-hover:text-cream-100 transition-colors">{f.title}</h3>
        <p className="text-cream-600 text-sm leading-relaxed group-hover:text-cream-400 transition-colors duration-300">{f.desc}</p>
      </div>
    </div>
  );
}

function Features() {
  const head  = useReveal();
  const grid  = useReveal(0.05);

  return (
    <section id="features" className="py-32 bg-ink-950">
      <div className="max-w-6xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-orchid-400 uppercase tracking-[0.3em] border border-orchid-900/50 bg-orchid-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Features
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-orchid-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-cream-100 tracking-[-0.03em]`}
              style={{ transitionDelay: "80ms" }}>
              Everything your front desk does.
              <br />
              <span className="text-cream-800">Without the front desk.</span>
            </h2>
          </div>
        </div>

        {/* Bento */}
        <div ref={grid.ref} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BentoCard f={FEATURES[0]} index={0} visible={grid.visible} horizontal />
          <BentoCard f={FEATURES[1]} index={1} visible={grid.visible} />
          {FEATURES.slice(2, 5).map((f, i) => <BentoCard key={f.title} f={f} index={i + 2} visible={grid.visible} />)}
          <BentoCard f={FEATURES[5]} index={5} visible={grid.visible} />
          <BentoCard f={FEATURES[6]} index={6} visible={grid.visible} horizontal />
          <BentoCard f={FEATURES[7]} index={7} visible={grid.visible} />
          <BentoCard f={FEATURES[8]} index={8} visible={grid.visible} />
          <div className="hidden md:block" />
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Quote card  (extracts hook to top-level component)
═══════════════════════════════════════════════════════════════════ */
function QuoteCard({ quote, index, visible }: {
  quote: { text: string; name: string; role: string; initials: string };
  index: number;
  visible: boolean;
}) {
  const tilt = useTilt(3);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`reveal-up ${visible ? "visible" : ""} glass tilt rounded-2xl p-8 group`}
      style={{ transitionDelay: `${index * 130}ms` }}
    >
      <div className="text-6xl leading-none mb-2 select-none font-serif text-orchid-900/50 group-hover:text-orchid-900/70 transition-colors">&ldquo;</div>
      <Stars />
      <p className="text-cream-400 leading-relaxed mb-8 text-sm group-hover:text-cream-200 transition-colors duration-300">{quote.text}</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orchid-600 to-orchid-500/70 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-cream-100">{quote.initials}</span>
        </div>
        <div>
          <p className="font-semibold text-sm text-cream-200">{quote.name}</p>
          <p className="text-cream-600 text-xs mt-0.5">{quote.role}</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Testimonials
═══════════════════════════════════════════════════════════════════ */
function Stars() {
  return (
    <div className="flex gap-0.5 mb-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="#d4a017">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

const QUOTES = [
  { text: "We were losing 30% of our calls to voicemail. Now every single call gets answered. Our bookings are up 40% in two months.", name: "Dr. Sarah Chen",      role: "Owner, Radiance Medical Spa",        initials: "SC" },
  { text: "The AI knows our service menu better than some of our staff. Patients love that they get instant answers at 9pm on a Saturday.", name: "Jennifer Martinez", role: "Practice Manager, Glow Aesthetics",   initials: "JM" },
  { text: "Setup was painless. We sent our service list and pricing, and 48 hours later we had a fully trained AI receptionist.",          name: "Michael Torres",   role: "Owner, Skin Studio LA",              initials: "MT" },
];

function Testimonials() {
  const head  = useReveal();
  const cards = useReveal(0.1);

  return (
    <section className="py-32 bg-ink-900/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_50%,rgba(80,40,160,0.07),transparent)]" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orchid-600/20 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-orchid-400 uppercase tracking-[0.3em] border border-orchid-900/50 bg-orchid-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Testimonials
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-orchid-600/30 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-cream-100 tracking-[-0.03em]`}
              style={{ transitionDelay: "80ms" }}>
              Loved by med spa owners
            </h2>
          </div>
        </div>

        <div ref={cards.ref} className="grid md:grid-cols-3 gap-4">
          {QUOTES.map((q, i) => (
            <QuoteCard key={q.name} quote={q} index={i} visible={cards.visible} />
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cream-800/15 to-transparent" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Pricing
═══════════════════════════════════════════════════════════════════ */
const PLANS = [
  { name: "Starter",    price: "$199", desc: "For single-location med spas", features: ["1 phone number","Up to 500 calls/mo","Custom knowledge base","Call dashboard","Email support","Billing FAQ support"] },
  { name: "Growth",     price: "$499", desc: "For growing practices",        features: ["Up to 3 phone numbers","Unlimited calls","Appointment booking integration","Call transcripts & analytics","Priority support","SMS follow-up","Outbound reminder campaigns","Referral tracking"], featured: true },
  { name: "Enterprise", price: "Custom", desc: "For multi-location groups",  features: ["Unlimited numbers","Unlimited calls","Custom integrations","Dedicated account manager","White-label options","SLA guarantee","Custom outbound campaigns","Advanced referral analytics"] },
];

function Pricing() {
  const head  = useReveal();
  const cards = useReveal(0.1);

  return (
    <section id="pricing" className="py-32 bg-ink-950">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-orchid-400 uppercase tracking-[0.3em] border border-orchid-900/50 bg-orchid-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Pricing
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-orchid-600/30 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-cream-100 tracking-[-0.03em]`}
              style={{ transitionDelay: "80ms" }}>
              Simple, transparent pricing
            </h2>
            <p className={`reveal-up ${head.visible ? "visible" : ""} text-cream-400 mt-4 max-w-xl mx-auto text-lg font-light`}
              style={{ transitionDelay: "160ms" }}>
              Less than the cost of a part-time receptionist. Cancel anytime.
            </p>
          </div>
        </div>

        <div ref={cards.ref} className="grid md:grid-cols-3 gap-4 items-start">
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              className={`reveal-scale ${cards.visible ? "visible" : ""} relative rounded-2xl p-8 border transition-all duration-300 ${
                plan.featured
                  ? "border-orchid-600/35 bg-gradient-to-b from-orchid-700/80 to-orchid-950/90 -mt-4 animate-glow-pulse"
                  : "glass hover:border-orchid-700/30"
              }`}
              style={{ transitionDelay: `${i * 130}ms` }}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-cream-100 text-xs font-bold px-5 py-2 rounded-full whitespace-nowrap shadow-lg shadow-amber-950/40">
                    Most Popular
                  </span>
                </div>
              )}
              <p className={`font-bold text-lg tracking-tight ${plan.featured ? "text-cream-100" : "text-cream-200"}`}>{plan.name}</p>
              <div className="mt-4 mb-1 flex items-end gap-1">
                <span className={`text-5xl font-black tracking-tighter ${plan.featured ? "text-cream-100" : "text-cream-100"}`}>{plan.price}</span>
                {plan.price !== "Custom" && (
                  <span className={`text-sm mb-2 ${plan.featured ? "text-orchid-300" : "text-cream-600"}`}>/month</span>
                )}
              </div>
              <p className={`text-sm mb-7 ${plan.featured ? "text-orchid-300" : "text-cream-600"}`}>{plan.desc}</p>
              <Link
                href="/book-a-demo"
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all mb-7 ${
                  plan.featured
                    ? "bg-cream-100 text-orchid-700 hover:bg-cream-200"
                    : "bg-ink-800/80 text-cream-200 hover:bg-ink-700/80 border border-cream-800/40"
                }`}
              >
                {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
              </Link>
              <ul className="space-y-3.5">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-3 ${plan.featured ? "text-orchid-200" : "text-cream-600"}`}>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-orchid-300" : "text-orchid-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Demo CTA
═══════════════════════════════════════════════════════════════════ */
function DemoSection() {
  const { ref, visible } = useReveal();
  return (
    <section id="demo" className="py-32 bg-ink-900/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_70%_at_50%_60%,rgba(100,50,200,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_35%_35%_at_20%_20%,rgba(80,40,160,0.07),transparent)]" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orchid-600/20 to-transparent" />

      <div ref={ref} className="relative max-w-2xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className={`reveal-up ${visible ? "visible" : ""} text-4xl md:text-[52px] font-extrabold text-cream-100 mb-5 tracking-[-0.03em] leading-tight`}>
            Ready to never miss a call again?
          </h2>
          <p className={`reveal-up ${visible ? "visible" : ""} text-cream-400 text-lg font-light`} style={{ transitionDelay: "100ms" }}>
            Get a personalized demo for your med spa. We&apos;ll have your AI receptionist ready in 48 hours.
          </p>
        </div>
        <div className={`reveal-up ${visible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>
          <DemoForm />
        </div>
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
    if (res.ok) { setStatus("success"); setForm({ name: "", email: "", business_name: "", phone: "" }); }
    else setStatus("error");
  }

  if (status === "success") {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <div className="w-16 h-16 bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto mb-5 border border-emerald-800/40">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 className="text-xl font-bold text-cream-100 mb-2">You&apos;re on the list!</h3>
        <p className="text-cream-600">We&apos;ll reach out within 24 hours to schedule your personalized demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 md:p-10 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { label: "Your Name",       key: "name",          type: "text",  placeholder: "Jane Smith",        required: true  },
          { label: "Email",           key: "email",         type: "email", placeholder: "jane@medspa.com",   required: true  },
          { label: "Med Spa Name",    key: "business_name", type: "text",  placeholder: "Radiance Med Spa",  required: true  },
          { label: "Phone (optional)",key: "phone",         type: "tel",   placeholder: "(555) 000-0000",    required: false },
        ].map(({ label, key, type, placeholder, required }) => (
          <div key={key}>
            <label className="block text-[10px] font-bold text-cream-600 uppercase tracking-[0.18em] mb-2">{label}</label>
            <input
              type={type} required={required}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full px-4 py-3 bg-ink-800/70 border border-cream-800/30 rounded-xl text-cream-100 placeholder-cream-800 focus:outline-none focus:ring-2 focus:ring-orchid-500/40 focus:border-orchid-600/40 text-sm transition-all"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
      <button
        type="submit" disabled={status === "loading"}
        className="w-full py-4 bg-orchid-600 text-cream-100 font-semibold rounded-xl hover:bg-orchid-500 disabled:opacity-50 transition-all text-base mt-2 shadow-lg shadow-orchid-950/60"
      >
        {status === "loading" ? "Submitting..." : "Request Your Free Demo →"}
      </button>
      {status === "error" && <p className="text-red-400 text-sm text-center">Something went wrong. Please try again.</p>}
      <p className="text-cream-800 text-xs text-center tracking-wide">No commitment · Free trial available · Setup in 48 hours</p>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Footer
═══════════════════════════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="border-t border-cream-800/20 py-14 bg-ink-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="f-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#c4adff"/>
                  <stop offset="100%" stopColor="#9d7eff"/>
                </linearGradient>
              </defs>
              <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#f-g)"/>
              <rect x="8" y="5"  width="5" height="22" rx="2.5" fill="url(#f-g)"/>
              <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#f-g)"/>
              <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#f-g)"/>
            </svg>
            <span className="font-bold tracking-tight text-base text-cream-200">
              Vaux<span className="text-orchid-400">Voice</span>
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm text-cream-600">
            <a href="#" className="hover:text-cream-200 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-cream-200 transition-colors">Terms of Service</a>
            <a href="mailto:hello@vauxvoice.com" className="hover:text-cream-200 transition-colors">Contact</a>
          </div>
          <p className="text-sm text-cream-800">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
