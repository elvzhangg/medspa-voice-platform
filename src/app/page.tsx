"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/* ════════════════════════════════════════════════════════════════════
   Hooks
═══════════════════════════════════════════════════════════════════ */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function useScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? (window.scrollY / max) * 100 : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return pct;
}

/** Scroll-linked parallax — translates element on Y as user scrolls past it. */
function useParallax(strength = 0.3) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const offset = (center - window.innerHeight / 2) * -strength;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, [strength]);
  return ref;
}

function useCounter(target: number, duration = 1900, enabled = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!enabled || target <= 0) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, target, duration]);
  return val;
}

function useTilt(strength = 5) {
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

function useMagnetic(strength = 12) {
  const ref = useRef<HTMLAnchorElement>(null);
  const restore = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 0.55s cubic-bezier(0.16,1,0.3,1)";
    el.style.transform = "";
    setTimeout(() => { if (ref.current) ref.current.style.transition = ""; }, 550);
  }, []);
  const track = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * strength;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * strength;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, [strength]);
  return { ref, onMouseMove: track, onMouseLeave: restore };
}

/* ════════════════════════════════════════════════════════════════════
   Root
═══════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-ink-900 text-sage-100 overflow-x-hidden">
      <ScrollProgress />
      <CursorGlow />
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
   Scroll progress
═══════════════════════════════════════════════════════════════════ */
function ScrollProgress() {
  const pct = useScrollProgress();
  return <div className="scroll-progress" style={{ width: `${pct}%` }} />;
}

/* ════════════════════════════════════════════════════════════════════
   Cursor glow
═══════════════════════════════════════════════════════════════════ */
function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.left = `${e.clientX}px`;
        ref.current.style.top  = `${e.clientY}px`;
      }
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return <div ref={ref} className="cursor-glow hidden md:block" />;
}

/* ════════════════════════════════════════════════════════════════════
   Word reveal  (perspective flip-up per word)
═══════════════════════════════════════════════════════════════════ */
function WordReveal({ text, baseDelay = 0, className = "" }: {
  text: string; baseDelay?: number; className?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={`word-reveal-wrap ${className}`}>
      {words.map((w, i) => (
        <span
          key={i}
          className="word-item"
          style={{ animationDelay: `${baseDelay + i * 85}ms` }}
        >
          {w}{i < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Parallax layer — element translates on Y as the user scrolls
═══════════════════════════════════════════════════════════════════ */
function ParallaxLayer({
  strength = 0.25,
  className = "",
  style,
  children,
}: {
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const ref = useParallax(strength);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hero particles
═══════════════════════════════════════════════════════════════════ */
function HeroParticles() {
  const [pts, setPts] = useState<Array<{ x: number; y: number; dur: number; delay: number; size: number }>>([]);
  useEffect(() => {
    setPts(Array.from({ length: 28 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      dur:   3.5 + Math.random() * 4.5,
      delay: Math.random() * 6,
      size:  0.5 + Math.random() * 1.5,
    })));
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pts.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-em-400/25"
          style={{
            left: `${p.x}%`,
            top:  `${p.y}%`,
            width:  `${p.size}px`,
            height: `${p.size}px`,
            animationName: "particle-rise",
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            animationTimingFunction: "ease-out",
            animationIterationCount: "infinite",
          }}
        />
      ))}
    </div>
  );
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
      scrolled ? "bg-ink-950/90 backdrop-blur-2xl border-b border-sage-800/20" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="nav-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f59e0b"/>
                <stop offset="100%" stopColor="#09090b"/>
              </linearGradient>
            </defs>
            <rect x="1"  y="10" width="5" height="12" rx="2.5" fill="url(#nav-g)"/>
            <rect x="8"  y="5"  width="5" height="22" rx="2.5" fill="url(#nav-g)"/>
            <rect x="15" y="7"  width="5" height="18" rx="2.5" fill="url(#nav-g)"/>
            <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#nav-g)"/>
          </svg>
          <span className="text-lg font-bold tracking-tight text-sage-100 group-hover:text-sage-200 transition-colors">
            Vaux<span className="text-em-400">Voice</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-ink-800/60 border border-sage-800/25 backdrop-blur-md">
          {["How It Works", "Features", "Pricing"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/ /g, "-")}`}
              className="px-4 py-1.5 rounded-full text-sm font-medium text-sage-400 hover:text-sage-100 hover:bg-ink-700/60 transition-all duration-200"
            >
              {label}
            </a>
          ))}
        </div>

        <NavCTA />
      </div>
    </nav>
  );
}

function NavCTA() {
  const mag = useMagnetic(8);
  return (
    <Link
      ref={mag.ref}
      onMouseMove={mag.onMouseMove}
      onMouseLeave={mag.onMouseLeave}
      href="/book-a-demo"
      className="px-5 py-2.5 rounded-full font-semibold text-sm bg-em-600 text-white hover:bg-em-500 transition-colors shadow-lg shadow-em-950/60"
    >
      Request Demo
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hero
═══════════════════════════════════════════════════════════════════ */
function HeroCTA() {
  const primary = useMagnetic(14);
  const secondary = useMagnetic(10);
  return (
    <div className="hero-line-3 flex flex-col sm:flex-row items-center justify-center gap-3">
      <Link
        ref={primary.ref}
        onMouseMove={primary.onMouseMove}
        onMouseLeave={primary.onMouseLeave}
        href="/book-a-demo"
        className="px-8 py-4 rounded-full font-semibold text-base text-white bg-em-600 hover:bg-em-500 transition-colors animate-glow-pulse hover:scale-[1.03]"
      >
        Get Started Free →
      </Link>
      <a
        ref={secondary.ref}
        onMouseMove={secondary.onMouseMove}
        onMouseLeave={secondary.onMouseLeave}
        href="tel:+14783752044"
        className="px-8 py-4 rounded-full font-medium text-base text-sage-400 border border-sage-800/50 hover:border-em-600/50 hover:text-sage-200 hover:bg-ink-800/50 transition-all backdrop-blur-sm"
      >
        Try a Live Demo Call
      </a>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden bg-transparent">
      {/* Subtle video bed — barely visible on light theme */}
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-[0.07] mix-blend-multiply" src="/hero-video.mp4" />

      {/* Champagne mesh — slowly pans warm amber wash across hero */}
      <div className="absolute inset-0 hero-mesh pointer-events-none" />

      {/* Soft warm wash accents */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_25%,rgba(245,158,11,0.10),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_35%_35%_at_82%_72%,rgba(9,9,11,0.05),transparent)]" />

      {/* Fine grid — charcoal on white */}
      <div className="absolute inset-0 opacity-[0.045]" style={{
        backgroundImage: "linear-gradient(rgba(9,9,11,0.55) 1px,transparent 1px),linear-gradient(90deg,rgba(9,9,11,0.55) 1px,transparent 1px)",
        backgroundSize: "72px 72px",
        maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 60%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 60%, transparent 100%)",
      }} />

      {/* Particles */}
      <HeroParticles />

      {/* Spinning decorative rings */}
      <div className="spin-ring animate-spin-slow  absolute top-[15%] right-[8%]  w-[320px] h-[320px] opacity-40" />
      <div className="spin-ring animate-spin-rev   absolute bottom-[12%] left-[6%]  w-[200px] h-[200px] opacity-25" />

      {/* Aurora blobs — amber + charcoal, drifting + parallaxing */}
      <ParallaxLayer strength={0.35} className="absolute -top-[5%] -left-[10%] pointer-events-none">
        <div className="w-[620px] h-[620px] rounded-full blur-[110px] animate-aurora-a"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.22), transparent 70%)" }} />
      </ParallaxLayer>
      <ParallaxLayer strength={-0.22} className="absolute -bottom-[8%] -right-[8%] pointer-events-none">
        <div className="w-[680px] h-[680px] rounded-full blur-[120px] animate-aurora-b"
             style={{ background: "radial-gradient(circle, rgba(251,191,36,0.16), transparent 70%)", animationDelay: "2s" }} />
      </ParallaxLayer>
      <ParallaxLayer strength={0.18} className="absolute top-[38%] left-[32%] pointer-events-none">
        <div className="w-[520px] h-[520px] rounded-full blur-[100px] animate-aurora-c"
             style={{ background: "radial-gradient(circle, rgba(9,9,11,0.07), transparent 70%)", animationDelay: "1.2s" }} />
      </ParallaxLayer>
      <ParallaxLayer strength={-0.3} className="absolute top-[18%] right-[22%] pointer-events-none">
        <div className="w-[280px] h-[280px] rounded-full blur-[80px] animate-aurora-a"
             style={{ background: "radial-gradient(circle, rgba(252,211,77,0.14), transparent 70%)", animationDelay: "3.5s" }} />
      </ParallaxLayer>

      <div className="relative z-10 max-w-5xl mx-auto text-center w-full pt-20">
        {/* Badge */}
        <div className="hero-line-1 inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-em-900/50 bg-em-950/40 backdrop-blur-md text-sm text-em-300 mb-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-em-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-em-400" />
          </span>
          Now handling 50,000+ calls per month
        </div>

        {/* Headline — word-by-word reveal */}
        <h1 className="text-[clamp(52px,9vw,92px)] font-extrabold leading-[1.02] tracking-[-0.04em] mb-7">
          <WordReveal text="Your med spa's AI" baseDelay={220} className="text-sage-100 block" />
          <span className="block mt-1">
            <span className="gradient-text" style={{ animation: "gradient-pan 6s ease infinite, word-up 0.75s cubic-bezier(0.16,1,0.3,1) 680ms both" }}>
              receptionist
            </span>
          </span>
        </h1>

        {/* Sub */}
        <p className="hero-line-2 text-lg md:text-xl text-sage-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
          Never miss a call, never lose a lead. Our AI answers 24/7, knows your
          services and pricing, and books appointments — so your team can focus
          on what matters.
        </p>

        {/* CTAs — magnetic */}
        <HeroCTA />

        <p className="hero-line-4 text-sm text-sage-600 mt-6 tracking-wide">
          No credit card required · Live in under 48 hours
        </p>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-ink-950 to-transparent pointer-events-none" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Logo Marquee
═══════════════════════════════════════════════════════════════════ */
function LogoMarquee() {
  const names = ["Glow Aesthetics", "Radiance MD", "BeautyFix", "Skin Studio", "AuraClinic"];
  const doubled = [...names, ...names];
  const head = useReveal();
  return (
    <section className="py-12 border-y border-sage-800/25 bg-transparent overflow-hidden relative">
      <div ref={head.ref}>
        <p className={`reveal-blur ${head.visible ? "visible" : ""} text-center text-[10px] font-bold text-sage-600 uppercase tracking-[0.3em] mb-8`}>
          Trusted by leading med spas nationwide
        </p>
      </div>
      <div className="relative">
        <div className="flex animate-marquee">
          {doubled.map((name, i) => (
            <span key={i} className="inline-flex items-center gap-10 text-[11px] font-bold text-sage-800 uppercase tracking-[0.22em] whitespace-nowrap px-10">
              {name}
              <span className="text-em-900/60 text-[8px]">◆</span>
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 left-0  w-28 bg-gradient-to-r from-[var(--ink-900)] to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[var(--ink-900)] to-transparent pointer-events-none" />
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Stats  (animated counters)
═══════════════════════════════════════════════════════════════════ */
const STATS = [
  { raw: "98%",  num: 98, suffix: "%", label: "Call answer rate" },
  { raw: "<1s",  num: 0,  suffix: "",  label: "Response time" },
  { raw: "40%",  num: 40, suffix: "%", label: "More bookings" },
  { raw: "24/7", num: 0,  suffix: "",  label: "Availability" },
];

function StatItem({ raw, num, suffix, label, delay, visible }: {
  raw: string; num: number; suffix: string; label: string; delay: number; visible: boolean;
}) {
  const count   = useCounter(num, 2000, visible && num > 0);
  const display = num > 0 ? `${count}${suffix}` : raw;
  return (
    <div
      className={`reveal-scale ${visible ? "visible" : ""} group text-center py-14 px-8 border-r border-sage-800/20 last:border-r-0`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <p className="text-[clamp(50px,6.5vw,78px)] font-black tracking-tighter leading-none text-sage-100 group-hover:text-em-400 transition-colors duration-500">
        {display}
      </p>
      <p className="text-[11px] font-semibold text-sage-600 uppercase tracking-[0.22em] mt-4">
        {label}
      </p>
    </div>
  );
}

function Stats() {
  const { ref, visible } = useReveal(0.25);
  return (
    <section className="bg-transparent relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/30 to-transparent" />
      <div className="max-w-6xl mx-auto px-6">
        <div ref={ref} className="grid grid-cols-2 md:grid-cols-4">
          {STATS.map((s, i) => <StatItem key={s.label} {...s} delay={i * 110} visible={visible} />)}
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sage-800/20 to-transparent" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   How It Works
═══════════════════════════════════════════════════════════════════ */
const STEPS = [
  { num: "01", title: "Share your business info",  desc: "Send us your services, pricing, policies, and FAQs. We handle all the setup — no technical work on your end." },
  { num: "02", title: "We configure your AI",       desc: "Your AI receptionist is trained on your specific business. Custom voice, custom greeting, complete knowledge of your offerings." },
  { num: "03", title: "Go live in 48 hours",        desc: "Get a dedicated phone number or forward your existing line. Start answering every call, every time." },
];

function StepCard({ step, index, visible }: {
  step: typeof STEPS[0]; index: number; visible: boolean;
}) {
  const tilt = useTilt(4);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`reveal-up ${visible ? "visible" : ""} glass-glow tilt rounded-2xl p-8 z-10 relative`}
      style={{ transitionDelay: `${index * 130}ms` }}
    >
      <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-em-600 to-em-500/70 flex items-center justify-center mb-6 shadow-lg shadow-em-950/50">
        <span className="text-sm font-black text-sage-100">{step.num}</span>
      </div>
      <h3 className="text-lg font-bold mb-3 text-sage-100">{step.title}</h3>
      <p className="text-sage-600 leading-relaxed text-sm">{step.desc}</p>
    </div>
  );
}

function HowItWorks() {
  const head  = useReveal();
  const cards = useReveal(0.1);
  return (
    <section id="how-it-works" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_80%,rgba(245,158,11,0.07),transparent)] pointer-events-none" />
      <div className="max-w-5xl mx-auto px-6 relative">

        <div className="text-center mb-24">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}>
              How It Works
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-sage-100 tracking-[-0.03em] leading-tight`} style={{ transitionDelay: "80ms" }}>
              Live in three simple steps
            </h2>
          </div>
        </div>

        <div ref={cards.ref} className="relative grid md:grid-cols-3 gap-5">
          <div className={`line-expand hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-em-600/30 to-transparent z-0 ${cards.visible ? "visible" : ""}`} />
          {STEPS.map((s, i) => <StepCard key={s.num} step={s} index={i} visible={cards.visible} />)}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Feature icons + cards
═══════════════════════════════════════════════════════════════════ */
const GID = "fi";
function FG() {
  return (
    <defs>
      <linearGradient id={GID} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f59e0b"/>
        <stop offset="100%" stopColor="#09090b"/>
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

const FEATURES = [
  { icon: <FI><path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6.5-6 7.4V18h-2v-1.6C7.5 15.5 5 12.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/><path d="M10 17v4"/><path d="M14 17v4"/></FI>, title: "Deep Business Knowledge",      desc: "Trained on your exact services, pricing, packages, and policies. Answers questions like your best employee would.", wide: true },
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
  const dir  = index % 3 === 0 ? "reveal-left" : index % 3 === 2 ? "reveal-right" : "reveal-up";
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`${dir} ${visible ? "visible" : ""} ${f.wide ? "md:col-span-2" : ""} glass-glow tilt rounded-2xl p-7 group ${horizontal ? "flex gap-6 items-start" : ""}`}
      style={{ transitionDelay: `${index * 55}ms` }}
    >
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-em-900/50 bg-em-950/50 group-hover:border-em-700/50 group-hover:bg-em-900/40 transition-all duration-300 ${horizontal ? "" : "mb-4"}`}>
        {f.icon}
      </div>
      <div>
        <h3 className="font-bold text-sm mb-2 text-sage-200 group-hover:text-sage-100 transition-colors">{f.title}</h3>
        <p className="text-sage-600 text-sm leading-relaxed group-hover:text-sage-400 transition-colors duration-300">{f.desc}</p>
      </div>
    </div>
  );
}

function Features() {
  const head = useReveal();
  const grid = useReveal(0.05);
  return (
    <section id="features" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_50%_at_80%_30%,rgba(245,158,11,0.06),transparent)] pointer-events-none" />
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Features
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-sage-100 tracking-[-0.03em]`} style={{ transitionDelay: "80ms" }}>
              Everything your front desk does.
              <br /><span className="text-sage-800">Without the front desk.</span>
            </h2>
          </div>
        </div>

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
  { text: "We were losing 30% of our calls to voicemail. Now every single call gets answered. Our bookings are up 40% in two months.", name: "Dr. Sarah Chen",    role: "Owner, Radiance Medical Spa",      initials: "SC" },
  { text: "The AI knows our service menu better than some of our staff. Patients love that they get instant answers at 9pm on a Saturday.", name: "Jennifer Martinez", role: "Practice Manager, Glow Aesthetics", initials: "JM" },
  { text: "Setup was painless. We sent our service list and pricing, and 48 hours later we had a fully trained AI receptionist.", name: "Michael Torres", role: "Owner, Skin Studio LA", initials: "MT" },
];

function QuoteCard({ quote, index, visible }: {
  quote: typeof QUOTES[0]; index: number; visible: boolean;
}) {
  const tilt = useTilt(3);
  const dir  = index === 0 ? "reveal-left" : index === 2 ? "reveal-right" : "reveal-up";
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`${dir} ${visible ? "visible" : ""} glass-glow tilt rounded-2xl p-8 group`}
      style={{ transitionDelay: `${index * 130}ms` }}
    >
      <div className="text-6xl leading-none mb-2 select-none font-serif text-em-900/50 group-hover:text-em-800/60 transition-colors">&ldquo;</div>
      <Stars />
      <p className="text-sage-400 leading-relaxed mb-8 text-sm group-hover:text-sage-200 transition-colors duration-300">{quote.text}</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-em-600 to-em-500/70 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-sage-100">{quote.initials}</span>
        </div>
        <div>
          <p className="font-semibold text-sm text-sage-200">{quote.name}</p>
          <p className="text-sage-600 text-xs mt-0.5">{quote.role}</p>
        </div>
      </div>
    </div>
  );
}

function Testimonials() {
  const head  = useReveal();
  const cards = useReveal(0.1);
  return (
    <section className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_50%_at_50%_50%,rgba(245,158,11,0.06),transparent)] pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/18 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Testimonials
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/30 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-sage-100 tracking-[-0.03em]`} style={{ transitionDelay: "80ms" }}>
              Loved by med spa owners
            </h2>
          </div>
        </div>

        <div ref={cards.ref} className="grid md:grid-cols-3 gap-4">
          {QUOTES.map((q, i) => <QuoteCard key={q.name} quote={q} index={i} visible={cards.visible} />)}
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sage-800/12 to-transparent" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Pricing
═══════════════════════════════════════════════════════════════════ */
const PLANS = [
  { name: "Starter",    price: "$199",   desc: "For single-location med spas", features: ["1 phone number","Up to 500 calls/mo","Custom knowledge base","Call dashboard","Email support","Billing FAQ support"] },
  { name: "Growth",     price: "$499",   desc: "For growing practices",        features: ["Up to 3 phone numbers","Unlimited calls","Appointment booking integration","Call transcripts & analytics","Priority support","SMS follow-up","Outbound reminder campaigns","Referral tracking"], featured: true },
  { name: "Enterprise", price: "Custom", desc: "For multi-location groups",    features: ["Unlimited numbers","Unlimited calls","Custom integrations","Dedicated account manager","White-label options","SLA guarantee","Custom outbound campaigns","Advanced referral analytics"] },
];

function Pricing() {
  const head  = useReveal();
  const cards = useReveal(0.1);
  return (
    <section id="pricing" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_45%_at_20%_70%,rgba(251,191,36,0.05),transparent)] pointer-events-none" />
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-20">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Pricing
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/30 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-up ${head.visible ? "visible" : ""} text-4xl md:text-[58px] font-extrabold text-sage-100 tracking-[-0.03em]`} style={{ transitionDelay: "80ms" }}>
              Simple, transparent pricing
            </h2>
            <p className={`reveal-up ${head.visible ? "visible" : ""} text-sage-400 mt-4 max-w-xl mx-auto text-lg font-light`} style={{ transitionDelay: "160ms" }}>
              Less than the cost of a part-time receptionist. Cancel anytime.
            </p>
          </div>
        </div>

        <div ref={cards.ref} className="grid md:grid-cols-3 gap-4 items-start">
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              className={`reveal-scale ${cards.visible ? "visible" : ""} relative rounded-2xl p-8 border transition-all ${
                plan.featured
                  ? "border-em-600/30 bg-gradient-to-b from-em-700/80 to-em-950/95 -mt-4 animate-glow-pulse"
                  : "glass-glow hover:border-em-800/40"
              }`}
              style={{ transitionDelay: `${i * 130}ms` }}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-gold-400 to-gold-500 text-ink-950 text-xs font-black px-5 py-2 rounded-full whitespace-nowrap shadow-lg shadow-gold-500/25 animate-gold-pulse">
                    Most Popular
                  </span>
                </div>
              )}
              <p className={`font-bold text-lg tracking-tight ${plan.featured ? "text-sage-100" : "text-sage-200"}`}>{plan.name}</p>
              <div className="mt-4 mb-1 flex items-end gap-1">
                <span className="text-5xl font-black tracking-tighter text-sage-100">{plan.price}</span>
                {plan.price !== "Custom" && <span className={`text-sm mb-2 ${plan.featured ? "text-em-300" : "text-sage-600"}`}>/month</span>}
              </div>
              <p className={`text-sm mb-7 ${plan.featured ? "text-em-300" : "text-sage-600"}`}>{plan.desc}</p>
              <Link
                href="/book-a-demo"
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all mb-7 ${
                  plan.featured
                    ? "bg-sage-100 text-em-900 hover:bg-sage-200"
                    : "bg-ink-800/80 text-sage-200 hover:bg-ink-700/80 border border-sage-800/30"
                }`}
              >
                {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
              </Link>
              <ul className="space-y-3.5">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-3 ${plan.featured ? "text-em-200" : "text-sage-600"}`}>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-em-300" : "text-em-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <section id="demo" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_65%_at_50%_60%,rgba(245,158,11,0.10),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_30%_30%_at_20%_20%,rgba(251,191,36,0.04),transparent)]" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/18 to-transparent" />

      <div ref={ref} className="relative max-w-2xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className={`reveal-up ${visible ? "visible" : ""} text-4xl md:text-[52px] font-extrabold text-sage-100 mb-5 tracking-[-0.03em] leading-tight`}>
            Ready to never miss a call again?
          </h2>
          <p className={`reveal-up ${visible ? "visible" : ""} text-sage-400 text-lg font-light`} style={{ transitionDelay: "100ms" }}>
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
        <div className="w-16 h-16 bg-em-950/40 rounded-full flex items-center justify-center mx-auto mb-5 border border-em-800/40">
          <svg className="w-7 h-7 text-em-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 className="text-xl font-bold text-sage-100 mb-2">You&apos;re on the list!</h3>
        <p className="text-sage-600">We&apos;ll reach out within 24 hours to schedule your personalized demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 md:p-10 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { label: "Your Name",        key: "name",          type: "text",  placeholder: "Jane Smith",       required: true  },
          { label: "Email",            key: "email",         type: "email", placeholder: "jane@medspa.com",  required: true  },
          { label: "Med Spa Name",     key: "business_name", type: "text",  placeholder: "Radiance Med Spa", required: true  },
          { label: "Phone (optional)", key: "phone",         type: "tel",   placeholder: "(555) 000-0000",   required: false },
        ].map(({ label, key, type, placeholder, required }) => (
          <div key={key}>
            <label className="block text-[10px] font-bold text-sage-600 uppercase tracking-[0.18em] mb-2">{label}</label>
            <input
              type={type} required={required}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full px-4 py-3 bg-ink-800/70 border border-sage-800/25 rounded-xl text-sage-100 placeholder-sage-800 focus:outline-none focus:ring-2 focus:ring-em-500/40 focus:border-em-600/40 text-sm transition-all"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
      <button
        type="submit" disabled={status === "loading"}
        className="w-full py-4 bg-em-600 text-sage-100 font-semibold rounded-xl hover:bg-em-500 disabled:opacity-50 transition-all text-base mt-2 shadow-lg shadow-em-950/60 hover:shadow-em-900/60"
      >
        {status === "loading" ? "Submitting..." : "Request Your Free Demo →"}
      </button>
      {status === "error" && <p className="text-red-400 text-sm text-center">Something went wrong. Please try again.</p>}
      <p className="text-sage-800 text-xs text-center tracking-wide">No commitment · Free trial available · Setup in 48 hours</p>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Footer
═══════════════════════════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="border-t border-sage-800/25 py-14 bg-transparent relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="f-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6ee7b7"/>
                  <stop offset="100%" stopColor="#34d399"/>
                </linearGradient>
              </defs>
              <rect x="1"  y="10" width="5" height="12" rx="2.5" fill="url(#f-g)"/>
              <rect x="8"  y="5"  width="5" height="22" rx="2.5" fill="url(#f-g)"/>
              <rect x="15" y="7"  width="5" height="18" rx="2.5" fill="url(#f-g)"/>
              <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#f-g)"/>
            </svg>
            <span className="font-bold tracking-tight text-base text-sage-200">
              Vaux<span className="text-em-400">Voice</span>
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm text-sage-600">
            <a href="#" className="hover:text-sage-200 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-sage-200 transition-colors">Terms of Service</a>
            <a href="mailto:hello@vauxvoice.com" className="hover:text-sage-200 transition-colors">Contact</a>
          </div>
          <p className="text-sm text-sage-800">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
