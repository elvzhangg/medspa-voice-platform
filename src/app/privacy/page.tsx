import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — VauxVoice",
  description:
    "VauxVoice's Privacy Policy describing how we collect, use, and protect information about your use of the VauxVoice platform.",
};

/* ════════════════════════════════════════════════════════════════════
   Layout primitives — kept local, mirrors the Terms page so legal
   pages stay consistent.
═══════════════════════════════════════════════════════════════════ */
function LegalNav() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-ink-950/85 backdrop-blur-2xl border-b border-sage-800/20">
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="legal-nav-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#09090b" />
              </linearGradient>
            </defs>
            <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#legal-nav-g)" />
            <rect x="8" y="5" width="5" height="22" rx="2.5" fill="url(#legal-nav-g)" />
            <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#legal-nav-g)" />
            <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#legal-nav-g)" />
          </svg>
          <span className="font-serif text-[clamp(22px,2.2vw,28px)] font-medium tracking-[0.08em] text-sage-100 group-hover:text-sage-200 transition-colors">
            Vaux
            <span
              className="gradient-text"
              style={{ animation: "none", backgroundSize: "100% 100%" }}
            >
              Voice
            </span>
          </span>
        </Link>

        <Link
          href="/"
          className="text-sm text-sage-400 hover:text-sage-100 transition-colors px-4 py-2 rounded-full hover:bg-ink-800/60"
        >
          ← Back to home
        </Link>
      </div>
    </nav>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-sage-800/25 py-14 bg-transparent relative mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="legal-f-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#09090b" />
                </linearGradient>
              </defs>
              <rect x="1" y="10" width="5" height="12" rx="2.5" fill="url(#legal-f-g)" />
              <rect x="8" y="5" width="5" height="22" rx="2.5" fill="url(#legal-f-g)" />
              <rect x="15" y="7" width="5" height="18" rx="2.5" fill="url(#legal-f-g)" />
              <rect x="22" y="11" width="5" height="10" rx="2.5" fill="url(#legal-f-g)" />
            </svg>
            <span className="font-serif font-medium tracking-[0.08em] text-lg text-sage-100">
              Vaux
              <span
                className="gradient-text"
                style={{ animation: "none", backgroundSize: "100% 100%" }}
              >
                Voice
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-sage-400">
            <Link
              href="/privacy"
              className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors"
            >
              Terms of Service
            </Link>
            <a
              href="mailto:founders@vauxvoice.com"
              className="px-3 py-2 rounded-md hover:text-sage-100 hover:bg-ink-800/60 transition-colors"
            >
              Contact
            </a>
          </div>
          <p className="text-sm text-sage-400">© 2026 VauxVoice. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page — placeholder until full policy is drafted
═══════════════════════════════════════════════════════════════════ */
export default function PrivacyPage() {
  return (
    <div className="relative z-[1] min-h-screen bg-transparent text-sage-100">
      <LegalNav />

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-12">
        <header className="mb-12 pb-10 border-b border-sage-800/30">
          <p className="text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] mb-4">
            Legal
          </p>
          <h1 className="font-serif text-[clamp(36px,5vw,56px)] font-medium leading-[1.06] tracking-[-0.005em] text-sage-100 mb-5">
            Privacy <span className="italic">Policy</span>
          </h1>
          <p className="text-sage-400 text-sm">VauxVoice, Inc.</p>
        </header>

        <article className="space-y-6 text-sage-300 text-[15px] leading-[1.75]">
          <p>
            Our full Privacy Policy is currently being drafted. While we finalize it, you can reach
            us at any time with privacy questions, data requests, or concerns about how VauxVoice
            handles your information.
          </p>

          <div className="p-5 rounded-xl border border-sage-800/40 bg-ink-800/40">
            <p className="text-sage-200">
              Email:{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>
            </p>
          </div>

          <p className="text-sage-500 text-sm">
            For dispute resolution and arbitration terms, see our{" "}
            <Link
              href="/terms"
              className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
            >
              Terms of Service
            </Link>
            .
          </p>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
