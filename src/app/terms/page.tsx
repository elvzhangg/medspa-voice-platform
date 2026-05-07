import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — VauxVoice",
  description:
    "VauxVoice's Terms of Service, including the Arbitration Agreement and governing law for resolution of disputes related to use of the VauxVoice platform.",
};

/* ════════════════════════════════════════════════════════════════════
   Layout primitives — kept local to this page so the legal copy lives
   in one self-contained file.
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
   Page
═══════════════════════════════════════════════════════════════════ */
export default function ArbitrationPage() {
  return (
    <div className="relative z-[1] min-h-screen bg-transparent text-sage-100">
      <LegalNav />

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-12">
        {/* Header */}
        <header className="mb-12 pb-10 border-b border-sage-800/30">
          <p className="text-[10px] font-bold text-em-400 uppercase tracking-[0.3em] mb-4">
            Legal
          </p>
          <h1 className="font-serif text-[clamp(36px,5vw,56px)] font-medium leading-[1.06] tracking-[-0.005em] text-sage-100 mb-5">
            Terms of <span className="italic">Service</span>
          </h1>
          <p className="text-sage-400 text-sm">
            VauxVoice, Inc. &middot; Last updated May 7, 2026
          </p>
          <p className="mt-6 text-sage-300 text-[15px] leading-[1.75]">
            These Terms govern your use of VauxVoice. The sections below cover the{" "}
            <strong className="text-sage-100">Arbitration Agreement</strong> and{" "}
            <strong className="text-sage-100">Governing Law</strong>. Additional Terms covering
            fees, acceptable use, intellectual property, and other topics will be added here as
            VauxVoice continues to grow. By using VauxVoice you agree to the Terms set out below.
          </p>
        </header>

        {/* Body — Tailwind typography-style spacing without depending on the plugin */}
        <article className="space-y-10 text-sage-300 text-[15px] leading-[1.75]">
          {/* ── 1. Governing Law ─────────────────────────────────────── */}
          <section>
            <h2 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] mb-4">
              1. Governing Law
            </h2>
            <p>
              This Arbitration Agreement and any Dispute relating to your use of VauxVoice will be
              governed by the laws of the <strong className="text-sage-100">State of California</strong>,
              without regard to its conflict-of-laws rules. You irrevocably consent that the state and
              federal courts located in <strong className="text-sage-100">California</strong> will
              have exclusive jurisdiction to resolve any Dispute that is not subject to arbitration
              under Section 2 below.
            </p>
          </section>

          {/* ── 2. Dispute Resolution ────────────────────────────────── */}
          <section>
            <h2 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] mb-4">
              2. Dispute Resolution
            </h2>

            <h3 className="font-serif text-lg font-medium text-sage-100 mt-8 mb-3">
              Informal Negotiations
            </h3>
            <p>
              To expedite resolution and control the cost of any dispute, controversy, or claim
              relating to this Agreement or your use of VauxVoice (each, a{" "}
              <strong className="text-sage-100">&ldquo;Dispute&rdquo;</strong>, and collectively,
              the <strong className="text-sage-100">&ldquo;Disputes&rdquo;</strong>), brought by
              either you or VauxVoice (each a <strong className="text-sage-100">&ldquo;Party&rdquo;</strong>,
              and collectively the <strong className="text-sage-100">&ldquo;Parties&rdquo;</strong>),
              the Parties agree to first attempt to negotiate any Dispute (other than those expressly
              excluded below) informally for at least <strong className="text-sage-100">90 days</strong>{" "}
              before initiating arbitration. Such informal negotiations begin upon written notice from
              one Party to the other.
            </p>
            <p className="mt-4">
              For VauxVoice, written notice should be sent to{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>{" "}
              and to the mailing address in Section 3.
            </p>

            <h3 className="font-serif text-lg font-medium text-sage-100 mt-8 mb-3">
              Binding Arbitration
            </h3>
            <p>
              If the Parties are unable to resolve a Dispute through informal negotiations, the
              Dispute (other than those expressly excluded below) will be finally and exclusively
              resolved by binding arbitration.
            </p>
            <p className="mt-4 font-medium text-sage-100 uppercase tracking-wide text-sm">
              You understand that without this provision, you would have the right to sue in court
              and have a jury trial.
            </p>
            <p className="mt-4">
              The arbitration will be commenced and conducted under the{" "}
              <strong className="text-sage-100">
                Commercial Arbitration Rules of the American Arbitration Association
                (&ldquo;AAA&rdquo;)
              </strong>{" "}
              and, where appropriate, the AAA&apos;s Supplementary Procedures for Consumer Related
              Disputes (the <strong className="text-sage-100">&ldquo;AAA Consumer Rules&rdquo;</strong>),
              both available at{" "}
              <a
                href="https://www.adr.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                adr.org
              </a>
              . Your arbitration fees and your share of arbitrator compensation will be governed by
              the AAA Consumer Rules and, where appropriate, limited by them.
            </p>
            <p className="mt-4">
              The arbitration may be conducted in person, by telephone, online, or by submission of
              documents. The arbitrator will issue a decision in writing but is not required to
              provide a statement of reasons unless requested by either Party. The arbitrator must
              apply applicable law, and any award may be challenged if the arbitrator fails to do
              so. Except where otherwise required by the applicable AAA rules or applicable law,
              the arbitration will take place in{" "}
              <strong className="text-sage-100">California</strong>.
            </p>
            <p className="mt-4">
              Except as otherwise provided in this Agreement, the Parties may litigate in court to
              compel arbitration, stay proceedings pending arbitration, or to confirm, modify,
              vacate, or enter judgment on the award issued by the arbitrator.
            </p>
            <p className="mt-4">
              If for any reason a Dispute proceeds in court rather than in arbitration, it must be
              brought in the state and federal courts located in{" "}
              <strong className="text-sage-100">California</strong>, and the Parties consent to
              personal jurisdiction in those courts and waive any objection based on lack of
              personal jurisdiction or inconvenient forum. The United Nations Convention on
              Contracts for the International Sale of Goods and the Uniform Computer Information
              Transaction Act (UCITA) do not apply to this Agreement.
            </p>
            <p className="mt-4">
              If this arbitration provision is found to be illegal or unenforceable, neither Party
              will elect to arbitrate any Dispute falling within that portion of the provision found
              to be illegal or unenforceable, and such Dispute will be decided by a court of
              competent jurisdiction in the courts identified above.
            </p>

            <h3 className="font-serif text-lg font-medium text-sage-100 mt-8 mb-3">
              Restrictions
            </h3>
            <p>
              The Parties agree that any arbitration will be limited to the Dispute between the
              Parties individually. To the full extent permitted by law:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(a)</span>
                <span>no arbitration may be joined with any other proceeding;</span>
              </li>
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(b)</span>
                <span>
                  there is no right or authority for any Dispute to be arbitrated on a class-action
                  basis or to use class-action procedures; and
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(c)</span>
                <span>
                  there is no right or authority for any Dispute to be brought in a purported
                  representative capacity on behalf of the general public or any other persons.
                </span>
              </li>
            </ul>

            <h3 className="font-serif text-lg font-medium text-sage-100 mt-8 mb-3">
              Exceptions to Informal Negotiations and Arbitration
            </h3>
            <p>
              The Parties agree that the following Disputes are{" "}
              <strong className="text-sage-100">not</strong> subject to the informal negotiations
              and binding arbitration provisions above:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(a)</span>
                <span>
                  any Dispute seeking to enforce or protect, or concerning the validity of, any
                  intellectual property right of a Party;
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(b)</span>
                <span>
                  any Dispute related to, or arising from, allegations of theft, piracy, invasion
                  of privacy, or unauthorized use; and
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-em-400 shrink-0 font-medium">(c)</span>
                <span>any claim for injunctive relief.</span>
              </li>
            </ul>
            <p className="mt-4">
              If this provision is found to be illegal or unenforceable, neither Party will elect
              to arbitrate any Dispute falling within that portion of the provision found to be
              illegal or unenforceable, and such Dispute will be decided by a court of competent
              jurisdiction in the courts identified above.
            </p>
          </section>

          {/* ── 3. Contact ─────────────────────────────────────────── */}
          <section>
            <h2 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] mb-4">
              3. Contact
            </h2>
            <p>
              To start the informal negotiation process, or for any questions about this Agreement,
              contact:
            </p>
            <address className="not-italic mt-5 p-5 rounded-xl border border-sage-800/40 bg-ink-800/40">
              <p className="font-medium text-sage-100">VauxVoice, Inc.</p>
              <p className="text-sage-400 text-sm mt-1">
                [Mailing address &mdash; to be added before publication]
              </p>
              <p className="text-sage-300 text-sm mt-3">
                Email:{" "}
                <a
                  href="mailto:founders@vauxvoice.com"
                  className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
                >
                  founders@vauxvoice.com
                </a>
              </p>
            </address>
          </section>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
