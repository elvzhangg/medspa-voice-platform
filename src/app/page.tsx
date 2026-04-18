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
    // Respect user OS setting — skip JS-driven parallax entirely.
    if (typeof window !== "undefined"
        && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
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
    <div className="relative z-[1] min-h-screen bg-transparent text-sage-100 overflow-x-hidden">
      <ScrollProgress />
      <CursorGlow />
      <Nav />
      <Hero />
      <LogoMarquee />
      <Stats />
      <PlatformShowcase />
      <HowItWorks />
      <Features />
      <Integrations />
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
          <span className="font-serif text-[clamp(22px,2.2vw,28px)] font-medium tracking-[0.08em] text-sage-100 group-hover:text-sage-200 transition-colors">
            Vaux<span className="gradient-text" style={{ animation: "none", backgroundSize: "100% 100%" }}>Voice</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-ink-800/60 border border-sage-800/25 backdrop-blur-md">
          {["How It Works", "Features", "Pricing"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/ /g, "-")}`}
              className="px-4 py-2.5 rounded-full text-sm font-medium text-sage-400 hover:text-sage-100 hover:bg-ink-700/60 transition-all duration-200"
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
      className="inline-flex items-center px-5 py-2.5 rounded-full font-medium text-sm tracking-[0.02em] text-white bg-[#0a0a0a] hover:bg-black border border-white/10 hover:border-em-500/40 transition-all duration-300 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.55)]"
    >
      Book a private demo
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hero
═══════════════════════════════════════════════════════════════════ */
function HeroCTA() {
  const primary = useMagnetic(12);
  return (
    <div className="hero-line-3 flex items-center justify-center">
      <Link
        ref={primary.ref}
        onMouseMove={primary.onMouseMove}
        onMouseLeave={primary.onMouseLeave}
        href="/book-a-demo"
        className="group inline-flex items-center gap-2 px-7 py-3 rounded-full font-medium text-sm tracking-[0.02em] text-white bg-[#0a0a0a] hover:bg-black border border-white/10 hover:border-em-500/40 transition-all duration-300 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.6)] hover:scale-[1.02]"
      >
        Book a private demo
        <span className="inline-block transition-transform duration-300 group-hover:translate-x-0.5">→</span>
      </Link>
    </div>
  );
}

/* ─── Hero video carousel: 3 clips, each plays once, crossfade between ─ */
type HeroClip = { src: string; start?: number; end?: number; rate?: number };

const HERO_CLIPS: HeroClip[] = [
  // Option 1 — woman on phone near window (Mixkit 23735, 21.7s)
  { src: "/hero-video-1.mp4", start: 0, end: 6 },
  // Mixkit 39791 — young woman laughing (14.5s) — skip the teeth-closeup intro
  { src: "/hero-video-2.mp4", start: 3, end: 9 },
  // Original — close-up man on call (16s) — solo-man 2s stretched to ~6s
  { src: "/hero-video-3.mp4", start: 14, end: 16, rate: 0.333 },
];

function HeroVideoCarousel() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  const advance = useCallback(() => {
    setActive((i) => (i + 1) % HERO_CLIPS.length);
  }, []);

  // Play only the active video to save bandwidth; pause others.
  useEffect(() => {
    refs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        try { v.currentTime = HERO_CLIPS[i].start ?? 0; } catch {}
        v.playbackRate = HERO_CLIPS[i].rate ?? 1;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active]);

  // iOS Safari fallback: if autoplay is blocked (Low Power Mode, data saver, etc.),
  // kick off playback on the first user gesture.
  useEffect(() => {
    const kick = () => {
      const v = refs.current[0];
      if (v && v.paused) v.play().catch(() => {});
    };
    window.addEventListener("touchstart", kick, { once: true, passive: true });
    window.addEventListener("scroll",     kick, { once: true, passive: true });
    window.addEventListener("click",      kick, { once: true, passive: true });
    return () => {
      window.removeEventListener("touchstart", kick);
      window.removeEventListener("scroll",     kick);
      window.removeEventListener("click",      kick);
    };
  }, []);

  return (
    <>
      {HERO_CLIPS.map((clip, i) => (
        <video
          key={clip.src}
          ref={(el) => { refs.current[i] = el; }}
          muted
          playsInline
          preload="auto"
          autoPlay
          onLoadedMetadata={(e) => {
            const v = e.currentTarget as HTMLVideoElement;
            if (clip.start != null) {
              try { v.currentTime = clip.start; } catch {}
            }
            v.playbackRate = clip.rate ?? 1;
          }}
          onTimeUpdate={(e) => {
            if (i !== active) return;
            const v = e.currentTarget as HTMLVideoElement;
            if (clip.end != null && v.currentTime >= clip.end) advance();
          }}
          onEnded={i === active ? advance : undefined}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[1400ms] ease-in-out hero-video-layer"
          style={{ opacity: i === active ? undefined : 0 }}
          data-active={i === active ? "true" : "false"}
          src={clip.src}
        />
      ))}
    </>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden bg-transparent pt-28 pb-20 lg:py-24">
      {/* Video bed — 3-clip crossfade carousel */}
      <HeroVideoCarousel />

      {/* Centered warm glow behind the headline */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] h-[62%] bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-3xl pointer-events-none" />

      {/* ─── CENTER: Copy + live timeline ──────────────────────────── */}
      <div className="relative z-20 w-full max-w-5xl mx-auto text-center">
        <div className="hero-line-1 inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-sage-800/50 bg-white/70 backdrop-blur-md text-sm text-em-400 mb-8 shadow-sm shadow-em-950/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-em-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-em-400" />
          </span>
          Now handling 50,000+ calls per month
        </div>

        <h1 className="font-serif text-[clamp(40px,5.8vw,72px)] font-medium leading-[1.06] tracking-[-0.005em] mb-7">
          <WordReveal text="Your med spa's" baseDelay={220} className="text-sage-100 block" />
          <span className="block mt-2">
            <span className="gradient-text" style={{ animation: "gradient-pan 6s ease infinite, word-up 0.75s cubic-bezier(0.16,1,0.3,1) 680ms both" }}>
              AI Clientele Specialist
            </span>
          </span>
        </h1>

        <p className="hero-line-2 text-[clamp(16px,1.6vw,20px)] text-sage-200 max-w-[62ch] mx-auto mb-4 leading-snug">
          Every call answered. Every client remembered. Every opportunity captured.
        </p>
        <p className="hero-line-2 text-[clamp(16px,1.6vw,20px)] text-sage-200 max-w-[62ch] mx-auto mb-10 leading-relaxed">
          Meet <span className="gradient-text font-medium" style={{ animation: "gradient-pan 6s ease infinite" }}>Vivienne</span> — she speaks your services fluently, books appointments,
          and cares for each client the way your best spa would. Around the clock.
        </p>

        <div className="flex justify-center"><HeroCTA /></div>

        <p className="hero-line-4 text-sm text-sage-600 mt-6 tracking-wide">
          No credit card required · Live in under 48 hours
        </p>

        {/* ─── Live activity timeline ───────────────────────────────── */}
        <HeroTimeline />
      </div>
    </section>
  );
}

/* ─── Live activity timeline — 4 events connected left-to-right ─────── */
type TimelineStep = {
  time: string;
  label: string;
  title: string;
  subtitle: string;
  accent: "call" | "check" | "message" | "star";
};

const TIMELINE_STEPS: TimelineStep[] = [
  { time: "10:42", label: "Incoming",    title: "Sarah M.",    subtitle: "Botox consult · after-hours",  accent: "call" },
  { time: "10:43", label: "Booked",      title: "Thu 3:00 pm", subtitle: "Lip filler · added to Acuity", accent: "check" },
  { time: "10:43", label: "Follow-up",   title: "Emma K.",     subtitle: "6-wk Dysport recall · SMS",    accent: "message" },
  { time: "10:45", label: "5★ review",   title: "Jenna R.",    subtitle: "“Remembered my last visit — felt so taken care of.”", accent: "star" },
];

function TimelineIcon({ accent }: { accent: TimelineStep["accent"] }) {
  const base = "w-4 h-4";
  if (accent === "call") {
    return (
      <svg className={base} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
              d="M3 5a2 2 0 012-2h2l2 5-2.5 1.5a11 11 0 006 6L14 13l5 2v2a2 2 0 01-2 2A14 14 0 013 5z"/>
      </svg>
    );
  }
  if (accent === "check") {
    return (
      <svg className={base} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
      </svg>
    );
  }
  if (accent === "message") {
    return (
      <svg className={base} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
              d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
      </svg>
    );
  }
  return (
    <svg className={base} fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 1.5l2.6 5.3 5.9.85-4.26 4.14 1 5.87L10 14.77l-5.25 2.76 1-5.87L1.5 7.65l5.9-.85L10 1.5z"/>
    </svg>
  );
}

function HeroTimeline() {
  return (
    <div className="hero-line-4 relative mt-16 mx-auto max-w-4xl" style={{ animationDelay: "1.6s" }}>
      {/* Header strip */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-em-400 opacity-70" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-em-500" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-sage-400">
          Live · last 3 minutes at Glow Aesthetics
        </span>
      </div>

      <div className="glass rounded-2xl p-5 md:p-6 relative">
        {/* Connecting rail behind the icons (desktop only) */}
        <div className="hidden md:block absolute left-[10%] right-[10%] top-[46px]
                        h-px bg-gradient-to-r from-transparent via-em-500/40 to-transparent pointer-events-none" />

        <ol className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-3 text-left">
          {TIMELINE_STEPS.map((step, i) => (
            <li key={i} className="relative flex md:flex-col md:items-center md:text-center gap-3 md:gap-0">
              {/* Timestamp pill */}
              <p className="order-1 md:order-none md:mb-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-sage-600 md:text-sage-500">
                {step.time}
              </p>

              {/* Icon bubble */}
              <div className={`order-2 md:order-none shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                               relative z-[1] md:mx-auto ${
                  step.accent === "star"
                    ? "bg-gold-400 text-em-700"
                    : step.accent === "message"
                    ? "bg-em-500/90 text-white"
                    : step.accent === "check"
                    ? "bg-em-600 text-white"
                    : "bg-em-700 text-gold-300"
                }`}
                   style={{ boxShadow: "0 6px 20px rgba(9,9,11,0.18)" }}>
                <TimelineIcon accent={step.accent} />
              </div>

              {/* Text */}
              <div className="order-3 md:order-none md:mt-3 flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-em-500">{step.label}</p>
                <p className="text-sm font-medium text-sage-100 leading-snug mt-0.5 truncate md:whitespace-normal">
                  {step.title}
                </p>
                <p className="text-[10px] text-sage-500 leading-snug mt-0.5">{step.subtitle}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
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
            <span key={i} className="inline-flex items-center gap-10 text-[10px] font-bold text-sage-800 uppercase tracking-[0.22em] whitespace-nowrap px-10">
              {name}
              <span className="text-em-900/60 text-[10px]">◆</span>
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
  { raw: "99%",  num: 99,  suffix: "%", label: "Calls answered" },
  { raw: "<3s",  num: 0,   suffix: "",  label: "Greeted in" },
  { raw: "40%",  num: 40,  suffix: "%", label: "More bookings captured" },
  { raw: "3×",   num: 0,   suffix: "",  label: "Return visit rate" },
];

function StatItem({ raw, num, suffix, label, delay, visible }: {
  raw: string; num: number; suffix: string; label: string; delay: number; visible: boolean;
}) {
  const count   = useCounter(num, 2000, visible && num > 0);
  const display = num > 0 ? `${count}${suffix}` : raw;
  return (
    <div
      className={`reveal-zoom ${visible ? "visible" : ""} group text-center py-14 px-8 border-r border-sage-800/20 last:border-r-0`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <p className="font-serif text-[clamp(40px,5.8vw,72px)] font-medium tracking-tight leading-none text-sage-100 group-hover:text-em-400 transition-colors duration-500">
        {display}
      </p>
      <p className="text-[10px] font-medium text-sage-600 uppercase tracking-[0.22em] mt-4">
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
  { num: "01", title: "Tell us about your spa.",              desc: "Share your services, pricing, and the little details that make your spa yours. We listen carefully." },
  { num: "02", title: "We introduce Vivienne to your world.", desc: "Custom voice. Custom greeting. Fluent in your exact offerings. She becomes a natural part of your team." },
  { num: "03", title: "She begins, gracefully.",              desc: "A dedicated number or your existing line — forwarded. Live in under 48 hours. Every call from that moment, cared for." },
];

function StepCard({ step, index, visible, hovered, onHover }: {
  step: typeof STEPS[0]; index: number; visible: boolean;
  hovered: number | null; onHover: (i: number | null) => void;
}) {
  const isActive = hovered === index;
  const anyHovered = hovered !== null;
  const dimmed = anyHovered && !isActive;
  return (
    <div
      className={`reveal-up ${visible ? "visible" : ""} z-10 relative min-w-0`}
      style={{ transitionDelay: `${index * 130}ms` }}
    >
      <div
        onMouseEnter={() => onHover(index)}
        onMouseLeave={() => onHover(null)}
        className={`glass-glow rounded-2xl p-10 relative overflow-hidden flex flex-col items-center justify-center text-center transition-all duration-[500ms] ease-[cubic-bezier(0.4,0.0,0.2,1)] will-change-transform ${isActive ? "scale-[1.03]" : "scale-100"} ${dimmed ? "opacity-50" : "opacity-100"}`}
        style={{ height: 340 }}
      >
        <span
          aria-hidden
          className="absolute bottom-3 right-6 font-serif italic text-[120px] font-medium leading-none select-none pointer-events-none text-sage-100/[0.05]"
        >
          {step.num}
        </span>
        <h3 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] relative z-10 max-w-[14ch]">{step.title}</h3>
        <p
          className={`text-sage-300 leading-relaxed text-[15px] relative z-10 max-w-[24ch] mt-5 transition-all duration-[450ms] ease-[cubic-bezier(0.4,0.0,0.2,1)] ${isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        >
          {step.desc}
        </p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const head  = useReveal();
  const cards = useReveal(0.1);
  const [hovered, setHovered] = useState<number | null>(null);
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
            <h2 className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em] leading-tight`} style={{ transitionDelay: "80ms" }}>
              Live in three <span className="italic text-em-400">simple</span> steps
            </h2>
          </div>
        </div>

        <div ref={cards.ref} className="relative grid md:grid-cols-3 gap-5 items-stretch auto-rows-fr">
          <div className={`line-expand hidden md:block absolute top-12 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-em-600/20 to-transparent z-0 ${cards.visible ? "visible" : ""}`} />
          {STEPS.map((s, i) => <StepCard key={s.num} step={s} index={i} visible={cards.visible} hovered={hovered} onHover={setHovered} />)}
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

type FeatureItem = { icon: React.ReactNode; title: string; desc: string };
type FeatureGroup = { label: string; tagline: string; items: FeatureItem[] };

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: "Fluency",
    tagline: "The art of every conversation.",
    items: [
      { icon: <FI><path d="M2 12c1.5-3 3-4.5 4.5-4.5S9 9 10.5 12s3 4.5 4.5 4.5S18 15 19.5 12 21 7.5 22 7.5"/></FI>, title: "Natural Human Voice", desc: "Powered by ElevenLabs — callers can't tell it's AI. Choose from multiple voice profiles that match your brand." },
      { icon: <FI><path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6.5-6 7.4V18h-2v-1.6C7.5 15.5 5 12.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/><path d="M10 17v4"/><path d="M14 17v4"/></FI>, title: "Deep Business Knowledge", desc: "Trained on your exact services, pricing, packages, and policies. Answers questions like your best employee would." },
      { icon: <FI><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></FI>, title: "Appointment Booking", desc: "Collects patient info and schedules appointments directly. Integrates with your existing booking system." },
    ],
  },
  {
    label: "Intelligence",
    tagline: "Everything that keeps her sharp.",
    items: [
      { icon: <FI><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/></FI>, title: "Real-Time Dashboard", desc: "See every call, transcript, and outcome. Track missed calls, peak hours, and conversion rates." },
      { icon: <FI><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></FI>, title: "Instant Scalability", desc: "Handle 1 call or 1,000 simultaneous calls. No hold times, no voicemail — every caller gets answered." },
      { icon: <FI><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7z"/><path d="M9 12l2 2 4-4"/></FI>, title: "HIPAA Considerations", desc: "Built with healthcare privacy in mind. No sensitive patient data stored. SOC 2 compliance roadmap." },
    ],
  },
  {
    label: "Care, Extended",
    tagline: "Because good service doesn't end when the call does.",
    items: [
      { icon: <FI><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V7L6 11H4a1 1 0 0 0-1 1z"/><path d="M19 9c1.5 1 1.5 5 0 6"/><path d="M17 7c2.5 1.5 2.5 8.5 0 10"/></FI>, title: "Proactive Outbound Campaigns", desc: "Automatically reach out to patients for reminders, reactivation campaigns, and promotions via AI-powered calls and SMS." },
      { icon: <FI><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/><path d="M10 15h4"/></FI>, title: "Billing & Payment Support", desc: "AI handles billing questions, shares payment options, and sends payment links — so no revenue slips through the cracks." },
      { icon: <FI><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M10.5 8h3"/><path d="M9.5 10l2 6"/><path d="M14.5 10l-2 6"/></FI>, title: "Referral Management", desc: "Track referral sources, reward loyal patients automatically, and grow your practice through word-of-mouth." },
    ],
  },
];

function BentoCard({ f, index, visible }: {
  f: FeatureItem; index: number; visible: boolean;
}) {
  const tilt = useTilt(4);
  const dir  = index % 3 === 0 ? "reveal-left" : index % 3 === 2 ? "reveal-right" : "reveal-up";
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`${dir} ${visible ? "visible" : ""} glass-glow tilt rounded-2xl p-7 group`}
      style={{ transitionDelay: `${index * 55}ms` }}
    >
      <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-em-900/50 bg-em-950/50 group-hover:border-em-500/50 group-hover:bg-em-900/80 transition-all duration-300 mb-4">
        {f.icon}
      </div>
      <div>
        <h3 className="font-serif text-lg font-medium mb-2 text-sage-200 tracking-[-0.005em] group-hover:text-sage-100 transition-colors">{f.title}</h3>
        <p className="text-sage-600 text-sm leading-relaxed group-hover:text-sage-400 transition-colors duration-300">{f.desc}</p>
      </div>
    </div>
  );
}

function FeatureGroupBlock({ group, offset }: { group: FeatureGroup; offset: number }) {
  const head = useReveal(0.2);
  const grid = useReveal(0.05);
  return (
    <div className="mt-24 first:mt-0">
      <div ref={head.ref} className="text-center mb-10">
        <div className={`flex items-center justify-center gap-4 ${head.visible ? "visible" : ""} reveal-blur`}>
          <span className="h-px w-10 bg-sage-600/30" />
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-sage-500">
            {group.label}
          </span>
          <span className="h-px w-10 bg-sage-600/30" />
        </div>
      </div>
      <div ref={grid.ref} className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {group.items.map((f, i) => (
          <BentoCard key={f.title} f={f} index={offset + i} visible={grid.visible} />
        ))}
      </div>
    </div>
  );
}

function Features() {
  const head = useReveal();
  return (
    <section id="features" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_50%_at_80%_30%,rgba(245,158,11,0.06),transparent)] pointer-events-none" />
      {/* Parallax decoration */}
      <ParallaxLayer strength={0.4} className="absolute top-[10%] -left-[5%] pointer-events-none">
        <div className="w-[420px] h-[420px] rounded-full blur-[90px] animate-aurora-a" style={{ background: "radial-gradient(circle, rgba(245,158,11,0.10), transparent 70%)" }} />
      </ParallaxLayer>
      <ParallaxLayer strength={-0.25} className="absolute bottom-[10%] -right-[6%] pointer-events-none">
        <div className="w-[380px] h-[380px] rounded-full blur-[80px] animate-aurora-b" style={{ background: "radial-gradient(circle, rgba(251,191,36,0.09), transparent 70%)" }} />
      </ParallaxLayer>
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="text-center mb-24">
          <div ref={head.ref}>
            <span className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}>
              Features
            </span>
            <div className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`} />
            <h2 className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em] leading-tight`} style={{ transitionDelay: "80ms" }}>
              Built for the way med spas <span className="italic">actually</span> work.
            </h2>
            <p className={`reveal-up ${head.visible ? "visible" : ""} text-sage-400 mt-5 max-w-xl mx-auto text-lg`} style={{ transitionDelay: "160ms" }}>
              Every feature, considered. Every detail, cared for.
            </p>
          </div>
        </div>

        {FEATURE_GROUPS.map((group, gi) => (
          <FeatureGroupBlock key={group.label} group={group} offset={gi * 3} />
        ))}
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
      <div className="text-[clamp(32px,4.5vw,58px)] leading-none mb-2 select-none font-serif text-em-900/50 group-hover:text-em-500/60 transition-colors">&ldquo;</div>
      <Stars />
      <p className="text-sage-400 leading-relaxed mb-8 text-sm group-hover:text-sage-200 transition-colors duration-300">{quote.text}</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-em-600 to-em-500/70 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-sage-100">{quote.initials}</span>
        </div>
        <div>
          <p className="font-medium text-sm text-sage-200">{quote.name}</p>
          <p className="text-sage-600 text-[10px] mt-0.5">{quote.role}</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Platform Showcase — demo video + 3 capability cards
═══════════════════════════════════════════════════════════════════ */
const PLATFORM_CAPS = [
  {
    icon: (
      <FI>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </FI>
    ),
    title: "Built for med spa precision",
    desc: "Trained on conversations across injectables, laser, and skincare. Vivienne speaks your services, protocols, and pricing tiers out of the box — no phone-tree scripts.",
  },
  {
    icon: (
      <FI>
        <path d="M20 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        <path d="M9 10h.01" />
        <path d="M13 10h.01" />
        <path d="M17 10h.01" />
      </FI>
    ),
    title: "Personalize every client call",
    desc: "Prior visits, preferred providers, last Botox date, numbing preferences, chart notes — Vivienne remembers, so every caller feels recognized from hello.",
  },
  {
    icon: (
      <FI>
        <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        <path d="M21 4v5h-5" />
        <path d="M12 7v5l3 2" />
      </FI>
    ),
    title: "Orchestrate the full journey",
    desc: "From consult booking to pre-care reminders, rebooking, and membership renewals — Vivienne handles every touchpoint of the client journey, 24/7.",
  },
];

function VideoShowcase() {
  const card = useReveal();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      v.currentTime = 0;
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };
  return (
    <div
      ref={card.ref}
      className={`reveal-up ${card.visible ? "visible" : ""} relative rounded-[28px] overflow-hidden border border-sage-800/40 bg-gradient-to-br from-ink-900 to-em-950/40 shadow-2xl shadow-em-950/30`}
    >
      <div className="relative aspect-[21/10]">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 w-full h-full object-cover opacity-55"
          src="/hero-video-2.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-900/25 via-transparent to-ink-900/75" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <p className="text-[10px] font-bold text-sage-300 uppercase tracking-[0.3em]">
            Watch Vivienne in action
          </p>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="group relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/30 flex items-center justify-center hover:scale-[1.06] transition-transform shadow-2xl"
          >
            {!playing && (
              <span className="absolute inset-0 rounded-full border border-white/25 animate-ping pointer-events-none" />
            )}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="white"
              className={playing ? "" : "ml-1"}
            >
              {playing ? (
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              ) : (
                <path d="M8 5v14l11-7z" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformShowcase() {
  const head = useReveal();
  const cards = useReveal(0.1);
  return (
    <section className="py-28 bg-transparent relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/20 to-transparent" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[60%] h-[50%] bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.07),transparent_70%)] blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative">
        <div ref={head.ref} className="text-center mb-14">
          <span
            className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}
          >
            The Platform
          </span>
          <div
            className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`}
          />
          <h2
            className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em] leading-tight`}
            style={{ transitionDelay: "80ms" }}
          >
            From the first ring to the <span className="italic">follow-up</span>.
          </h2>
          <p
            className={`reveal-up ${head.visible ? "visible" : ""} text-sage-400 mt-4 max-w-xl mx-auto text-lg`}
            style={{ transitionDelay: "160ms" }}
          >
            One AI clientele specialist. Every moment of the client journey.
          </p>
        </div>

        <VideoShowcase />

        <div ref={cards.ref} className="grid md:grid-cols-3 gap-5 mt-8">
          {PLATFORM_CAPS.map((cap, i) => (
            <div
              key={cap.title}
              className={`reveal-up ${cards.visible ? "visible" : ""} glass-glow tilt rounded-2xl p-7 group`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center border border-em-900/50 bg-em-950/50 group-hover:border-em-500/50 group-hover:bg-em-900/80 transition-all duration-300 mb-5">
                {cap.icon}
              </div>
              <h3 className="font-serif text-lg font-medium mb-2 text-sage-100 tracking-[-0.005em]">
                {cap.title}
              </h3>
              <p className="text-sage-600 text-sm leading-relaxed group-hover:text-sage-400 transition-colors duration-300">
                {cap.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/20 to-transparent" />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Integrations — hub + platform chips
═══════════════════════════════════════════════════════════════════ */
const INTEGRATIONS: { name: string; dot: string }[] = [
  { name: "Acuity",      dot: "#F26522" },
  { name: "Boulevard",   dot: "#7C6BFF" },
  { name: "Mindbody",    dot: "#E2483F" },
  { name: "Vagaro",      dot: "#3FAE49" },
  { name: "Zenoti",      dot: "#0B7ED8" },
  { name: "Square",      dot: "#A1A1A1" },
  { name: "Fresha",      dot: "#1FC2B5" },
  { name: "GlossGenius", dot: "#C8A15A" },
  { name: "Jane",        dot: "#6B9B7A" },
  { name: "SalonBiz",    dot: "#3A6BB7" },
];

function IntegrationChip({ item, delay, visible }: {
  item: (typeof INTEGRATIONS)[number]; delay: number; visible: boolean;
}) {
  return (
    <div
      className={`reveal-up ${visible ? "visible" : ""} group rounded-xl px-4 py-3.5 bg-sage-900/30 border border-sage-800/40 backdrop-blur-sm flex items-center gap-2.5 hover:border-em-600/40 hover:bg-sage-900/50 hover:-translate-y-[1px] transition-all`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: item.dot, boxShadow: `0 0 10px ${item.dot}66` }}
      />
      <span className="text-sage-200 text-sm font-medium tracking-tight">{item.name}</span>
    </div>
  );
}

function Integrations() {
  const head = useReveal();
  const chips = useReveal(0.05);
  return (
    <section className="py-28 bg-transparent relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/20 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[55%] bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_70%)] blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 relative">
        <div ref={head.ref} className="text-center mb-14">
          <span
            className={`reveal-blur ${head.visible ? "visible" : ""} inline-block text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] border border-em-900/50 bg-em-950/40 px-4 py-1.5 rounded-full mb-6`}
          >
            Integrations
          </span>
          <div
            className={`line-expand-center mx-auto h-px bg-gradient-to-r from-transparent via-em-600/35 to-transparent max-w-xs mb-8 ${head.visible ? "visible" : ""}`}
          />
          <h2
            className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em] leading-tight`}
            style={{ transitionDelay: "80ms" }}
          >
            Works with the <span className="italic">tools</span> you already use.
          </h2>
          <p
            className={`reveal-up ${head.visible ? "visible" : ""} text-sage-400 mt-4 max-w-xl mx-auto text-lg`}
            style={{ transitionDelay: "160ms" }}
          >
            Deep integration across 10+ booking platforms — Vivienne works beautifully with the platforms your team already loves.
          </p>
        </div>

        <div ref={chips.ref} className="relative">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {INTEGRATIONS.slice(0, 5).map((item, i) => (
              <IntegrationChip
                key={item.name}
                item={item}
                delay={i * 50}
                visible={chips.visible}
              />
            ))}
          </div>

          <div className="relative flex items-center justify-center py-10 md:py-14">
            <div className="absolute inset-x-[15%] top-1/2 h-px bg-gradient-to-r from-transparent via-em-600/30 to-transparent" />
            <div className="relative">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-em-500 to-em-700 border border-em-400/40 shadow-2xl shadow-em-950/40 flex items-center justify-center relative z-10">
                <span className="font-serif text-4xl md:text-5xl font-medium text-white italic leading-none">V</span>
              </div>
              <span className="absolute inset-0 rounded-full border border-em-500/30 animate-ping pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {INTEGRATIONS.slice(5).map((item, i) => (
              <IntegrationChip
                key={item.name}
                item={item}
                delay={(i + 5) * 50}
                visible={chips.visible}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-em-600/20 to-transparent" />
    </section>
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
            <h2 className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em]`} style={{ transitionDelay: "80ms" }}>
              <span className="italic">Loved</span> by med spa owners
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
            <h2 className={`reveal-tilt ${head.visible ? "visible" : ""} text-[clamp(32px,4.5vw,58px)] font-medium text-sage-100 tracking-[-0.005em]`} style={{ transitionDelay: "80ms" }}>
              <span className="italic">Simple</span>, transparent pricing
            </h2>
            <p className={`reveal-up ${head.visible ? "visible" : ""} text-sage-400 mt-4 max-w-xl mx-auto text-lg`} style={{ transitionDelay: "160ms" }}>
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
                  ? "border-em-500/60 bg-gradient-to-b from-em-500 to-em-600 -mt-4 animate-glow-pulse"
                  : "glass-glow hover:border-em-500/40"
              }`}
              style={{ transitionDelay: `${i * 130}ms` }}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-gold-400 to-gold-500 text-ink-950 text-[10px] font-bold px-5 py-2 rounded-full whitespace-nowrap shadow-lg shadow-gold-500/25 animate-gold-pulse">
                    Most Popular
                  </span>
                </div>
              )}
              <p className={`font-serif font-medium text-lg tracking-normal ${plan.featured ? "text-white" : "text-sage-200"}`}>{plan.name}</p>
              <div className="mt-4 mb-1 flex items-end gap-1">
                <span className={`font-serif text-[clamp(32px,4.5vw,58px)] font-medium tracking-tight ${plan.featured ? "text-white" : "text-sage-100"}`}>{plan.price}</span>
                {plan.price !== "Custom" && <span className={`text-sm mb-2 ${plan.featured ? "text-white/70" : "text-sage-600"}`}>/month</span>}
              </div>
              <p className={`text-sm mb-7 ${plan.featured ? "text-white/75" : "text-sage-600"}`}>{plan.desc}</p>
              <Link
                href="/book-a-demo"
                className={`block text-center py-3 rounded-xl font-medium text-sm transition-all mb-7 ${
                  plan.featured
                    ? "bg-gold-400 text-em-600 hover:bg-gold-300"
                    : "bg-ink-800/80 text-sage-200 hover:bg-ink-700/80 border border-sage-800/30"
                }`}
              >
                {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
              </Link>
              <ul className="space-y-3.5">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-3 ${plan.featured ? "text-white/85" : "text-sage-600"}`}>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-gold-400" : "text-em-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <h2 className={`reveal-tilt ${visible ? "visible" : ""} font-medium text-sage-100 mb-5 tracking-[-0.005em] leading-[1.08]`}>
            <span className="block text-[clamp(32px,4.5vw,58px)]">Your clients are already calling.</span>
            <span className="block italic text-sage-200 text-[clamp(22px,2.8vw,36px)] mt-2">She&apos;s ready when you are.</span>
          </h2>
          <p className={`reveal-up ${visible ? "visible" : ""} text-sage-400 text-lg`} style={{ transitionDelay: "100ms" }}>
            A private demo, tailored to your spa. Vivienne is live in under 48 hours.
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
        <h3 className="text-lg font-bold text-sage-100 mb-2">You&apos;re on the list!</h3>
        <p className="text-sage-600">We&apos;ll reach out within 24 hours to schedule your personalized demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 md:p-10 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { label: "Name",             key: "name",          type: "text",  placeholder: "Jane Smith",       required: true  },
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
        className="w-full py-4 bg-em-600 text-sage-100 font-medium rounded-xl hover:bg-em-500 disabled:opacity-50 transition-all text-base mt-2 shadow-lg shadow-em-950/60 hover:shadow-em-900/60"
      >
        {status === "loading" ? "Submitting..." : "Book a private demo →"}
      </button>
      {status === "error" && <p className="text-red-400 text-sm text-center">Something went wrong. Please try again.</p>}
      <p className="text-sage-800 text-[10px] text-center tracking-wide">Private. Unhurried. Live in under 48 hours.</p>
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
            <span className="font-serif font-medium tracking-[0.08em] text-lg text-sage-200">
              Vaux<span className="gradient-text" style={{ animation: "none", backgroundSize: "100% 100%" }}>Voice</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-sage-400">
            <a href="#" className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors">Privacy Policy</a>
            <a href="#" className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors">Terms of Service</a>
            <a href="mailto:hello@vauxvoice.com" className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors">Contact</a>
          </div>
          <p className="text-sm text-sage-400">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
