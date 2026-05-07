import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — VauxVoice",
  description:
    "VauxVoice's Terms of Service, including acceptable use, fees, intellectual property, the Arbitration Agreement, and governing law for the VauxVoice platform.",
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
   Reusable section primitives
═══════════════════════════════════════════════════════════════════ */
function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] mb-4">
      {n}. {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-serif text-lg font-medium text-sage-100 mt-8 mb-3">
      {children}
    </h3>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <strong className="text-sage-100">{children}</strong>;
}

function Bullet({ marker, children }: { marker?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-em-400 shrink-0 font-medium">{marker ?? "•"}</span>
      <span>{children}</span>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════════════ */
export default function TermsPage() {
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
        </header>

        {/* Body */}
        <article className="space-y-10 text-sage-300 text-[15px] leading-[1.75]">

          {/* ── 1. Acceptance of Terms ─────────────────────────────── */}
          <section>
            <H2 n={1}>Acceptance of Terms</H2>
            <p>
              These Terms of Service (the <Em>&ldquo;Terms&rdquo;</Em>) form a binding contract
              between you and <Em>VauxVoice, Inc.</Em> (<Em>&ldquo;VauxVoice&rdquo;</Em>,{" "}
              <Em>&ldquo;we&rdquo;</Em>, or <Em>&ldquo;us&rdquo;</Em>). By creating an account,
              accessing the platform, or using any of our services (collectively, the{" "}
              <Em>&ldquo;Service&rdquo;</Em>), you confirm that you have read these Terms,
              understand them, and agree to be bound by them. If you do not agree, do not access
              or use the Service.
            </p>
            <p className="mt-4">
              If you are using the Service on behalf of a business, organization, or other legal
              entity, you represent that you are authorized to bind that entity to these Terms,
              and <Em>&ldquo;you&rdquo;</Em> refers both to you individually and to that entity.
              The Service is intended for users who are at least 18 years old and is not directed
              to anyone under 18.
            </p>
          </section>

          {/* ── 2. The Service ─────────────────────────────────────── */}
          <section>
            <H2 n={2}>The Service</H2>
            <p>
              VauxVoice provides AI-powered voice receptionist software designed primarily for
              medical spa and aesthetic clinic businesses. The Service allows you to deploy a
              customized AI agent that can answer inbound calls, schedule appointments, send SMS
              communications, and integrate with third-party booking platforms. Specific features
              and capabilities are described on our website and within your account dashboard,
              and may evolve over time.
            </p>
            <p className="mt-4">
              The Service is provided to you, the business customer. It is not designed,
              certified, or intended for use as a medical device, for emergency communications, for
              clinical decision-making, or as a substitute for licensed medical professionals. You
              are solely responsible for how you configure, deploy, and supervise the Service in
              your business.
            </p>
          </section>

          {/* ── 3. Accounts ────────────────────────────────────────── */}
          <section>
            <H2 n={3}>Accounts</H2>
            <p>To use most features of the Service, you must create an account. You agree to:</p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet>provide accurate, current, and complete information when registering;</Bullet>
              <Bullet>keep your login credentials confidential and not share them with anyone;</Bullet>
              <Bullet>
                be responsible for all activity that occurs under your account, whether
                authorized by you or not; and
              </Bullet>
              <Bullet>
                notify us promptly at{" "}
                <a
                  href="mailto:founders@vauxvoice.com"
                  className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
                >
                  founders@vauxvoice.com
                </a>{" "}
                if you suspect any unauthorized access or breach of security.
              </Bullet>
            </ul>
            <p className="mt-4">
              We may suspend or terminate accounts that contain false or incomplete information.
            </p>
          </section>

          {/* ── 4. Fees and Payment ────────────────────────────────── */}
          <section>
            <H2 n={4}>Fees and Payment</H2>
            <p>
              Use of the Service requires a paid subscription, unless we expressly offer a free
              trial or free tier. Pricing and plan details are posted on our website and are
              incorporated into these Terms by reference.
            </p>
            <p className="mt-4">
              You authorize VauxVoice (or our third-party payment processor) to charge the payment
              method you provide on a recurring basis for each billing cycle, including any
              applicable taxes, until you cancel. You agree to keep your payment information
              current. If a payment fails, we may retry the charge, suspend the Service, or
              terminate your account.
            </p>
            <p className="mt-4">
              We may change prices for new billing cycles by giving you reasonable advance notice.
              If you do not agree to a price change, you may cancel before the new price takes
              effect. Except where required by applicable law, fees are non-refundable.
            </p>
          </section>

          {/* ── 5. Cancellation ────────────────────────────────────── */}
          <section>
            <H2 n={5}>Cancellation</H2>
            <p>
              You may cancel your subscription at any time from within your account dashboard or
              by emailing{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>
              . Cancellation takes effect at the end of your then-current billing period, and you
              will continue to have access to the Service until that date. You will not receive a
              prorated refund for the unused portion of any billing cycle.
            </p>
            <p className="mt-4">
              If we terminate or suspend your account for breach of these Terms or for non-payment,
              your access may end immediately and previously paid fees are non-refundable.
            </p>
          </section>

          {/* ── 6. Acceptable Use ──────────────────────────────────── */}
          <section>
            <H2 n={6}>Acceptable Use</H2>
            <p>
              You agree to use the Service only for lawful business purposes and in accordance
              with these Terms. You agree NOT to:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet>
                use the Service for any illegal, fraudulent, or unauthorized purpose, or in any
                way that violates applicable law (including telemarketing and consumer-protection
                laws such as the TCPA, Telemarketing Sales Rule, and any state-level analogues);
              </Bullet>
              <Bullet>
                configure the Service to handle 911 or other emergency calls, or to provide
                medical advice, diagnosis, or treatment recommendations to callers;
              </Bullet>
              <Bullet>
                send outbound calls or SMS messages to recipients who have not provided the
                consent required under applicable law, or to numbers on the National Do Not Call
                Registry where consent is required;
              </Bullet>
              <Bullet>
                misrepresent the AI agent as a human in any context where applicable law requires
                disclosure that the caller is interacting with an AI;
              </Bullet>
              <Bullet>
                attempt to reverse engineer, decompile, disassemble, scrape, or extract the
                underlying source code, prompts, models, or training data of the Service;
              </Bullet>
              <Bullet>
                circumvent, disable, or interfere with security or access-control features of the
                Service, or attempt to access accounts, data, or areas you are not authorized to
                access;
              </Bullet>
              <Bullet>
                upload, transmit, or store malware, viruses, or other harmful code, or use the
                Service to conduct any denial-of-service or similar attack;
              </Bullet>
              <Bullet>
                use the Service to harass, threaten, defame, or harm any person, or to collect
                personal information about callers without proper consent and a lawful basis;
              </Bullet>
              <Bullet>
                resell, sublicense, or otherwise commercially exploit the Service, or use it to
                build a competing product; or
              </Bullet>
              <Bullet>
                use the Service in a manner that exceeds reasonable usage levels or that is
                intended to disrupt the Service for other customers.
              </Bullet>
            </ul>
            <p className="mt-4">
              We may investigate and take appropriate action — including suspending or terminating
              your account — if we reasonably believe you have violated these Acceptable Use rules.
            </p>
          </section>

          {/* ── 7. Healthcare Information and PHI ──────────────────── */}
          <section>
            <H2 n={7}>Healthcare Information and PHI</H2>
            <p>
              The Service is general-purpose business software and is{" "}
              <Em>not, by default,</Em> configured to receive, store, or process Protected Health
              Information (<Em>&ldquo;PHI&rdquo;</Em>) as defined under the Health Insurance
              Portability and Accountability Act of 1996 (<Em>&ldquo;HIPAA&rdquo;</Em>).
            </p>
            <p className="mt-4">
              If your use of the Service involves PHI, you must execute a separate Business
              Associate Agreement (<Em>&ldquo;BAA&rdquo;</Em>) with VauxVoice before transmitting
              any PHI through the Service. Without an executed BAA in place, you agree NOT to
              upload, transmit, or otherwise input PHI through the Service. You are responsible for
              evaluating whether your use of the Service requires HIPAA compliance, for obtaining
              any necessary BAAs (including with our subprocessors where applicable), and for the
              lawful collection and handling of any patient information under HIPAA, state law,
              and other applicable regulations.
            </p>
            <p className="mt-4">
              To request a BAA, contact{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>
              .
            </p>
          </section>

          {/* ── 8. Customer Data and Third-Party Services ──────────── */}
          <section>
            <H2 n={8}>Customer Data and Third-Party Services</H2>
            <p>
              You retain all right, title, and interest in the data you or your callers provide
              through the Service (<Em>&ldquo;Customer Data&rdquo;</Em>), including call
              recordings, transcripts, business information, knowledge-base content, customer
              contact details, and configuration settings. You grant VauxVoice a limited,
              non-exclusive, worldwide license to host, process, transmit, copy, and display
              Customer Data solely as needed to provide, secure, support, and improve the Service,
              in accordance with our{" "}
              <Link
                href="/privacy"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
            <p className="mt-4">
              To deliver the Service, we use third-party providers, which may include voice
              infrastructure, language model, voice synthesis, data storage, payment processing,
              and hosting providers, each operating under their own terms and privacy practices.
              Your use of the Service is also subject to those third-party providers&apos; terms to
              the extent applicable. We will use commercially reasonable efforts to maintain the
              security of Customer Data but cannot guarantee against every form of unauthorized
              access.
            </p>
            <p className="mt-4">
              You are solely responsible for the legality, accuracy, and quality of Customer Data;
              for backing up data that is critical to your business; and for obtaining all
              consents required from callers (including any call-recording consent under federal
              and state two-party consent laws).
            </p>
          </section>

          {/* ── 9. Intellectual Property and Feedback ──────────────── */}
          <section>
            <H2 n={9}>Intellectual Property and Feedback</H2>
            <p>
              The Service, including all underlying software, models, prompts, voice profiles,
              designs, content, and the VauxVoice and Vivienne names and logos (the{" "}
              <Em>&ldquo;VauxVoice IP&rdquo;</Em>), is owned by VauxVoice or its licensors and is
              protected by copyright, trademark, and other intellectual property laws. We grant
              you a limited, revocable, non-exclusive, non-transferable license to access and use
              the Service during your subscription, solely for your internal business purposes,
              in accordance with these Terms. We reserve all rights not expressly granted to you.
            </p>
            <p className="mt-4">
              If you submit suggestions, ideas, or feedback about the Service (
              <Em>&ldquo;Feedback&rdquo;</Em>), you grant VauxVoice a perpetual, irrevocable,
              royalty-free, worldwide license to use, modify, and incorporate that Feedback for
              any purpose, without compensation to you and without any obligation of
              confidentiality.
            </p>
          </section>

          {/* ── 10. Service Availability and Modifications ─────────── */}
          <section>
            <H2 n={10}>Service Availability and Modifications</H2>
            <p>
              We strive to keep the Service available and operating reliably, but we do not
              guarantee uninterrupted access. The Service may experience downtime due to
              maintenance, updates, third-party outages, or events beyond our control. We reserve
              the right to modify, suspend, or discontinue all or part of the Service at any time,
              with or without notice, and we will not be liable to you for any such modification or
              discontinuation.
            </p>
          </section>

          {/* ── 11. Disclaimer of Warranties ───────────────────────── */}
          <section>
            <H2 n={11}>Disclaimer of Warranties</H2>
            <p className="font-medium text-sage-100 uppercase tracking-wide text-sm">
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
              warranties of any kind, express or implied. To the fullest extent permitted by law,
              VauxVoice disclaims all warranties, including the implied warranties of
              merchantability, fitness for a particular purpose, non-infringement, and any
              warranties arising from course of dealing or usage of trade.
            </p>
            <p className="mt-4">
              We do not warrant that the Service will be uninterrupted, secure, or free of errors,
              that the outputs of the AI will be accurate or free of mistakes, or that any defects
              will be corrected. AI-generated responses may contain errors, omissions, or
              inaccuracies, and you are responsible for reviewing and verifying outputs before
              relying on them. The Service is not medical advice and is not a substitute for
              professional judgment.
            </p>
          </section>

          {/* ── 12. Limitation of Liability ────────────────────────── */}
          <section>
            <H2 n={12}>Limitation of Liability</H2>
            <p className="font-medium text-sage-100 uppercase tracking-wide text-sm">
              To the fullest extent permitted by law, in no event will VauxVoice or its directors,
              officers, employees, agents, or licensors be liable for any indirect, incidental,
              special, consequential, exemplary, or punitive damages, including damages for lost
              profits, lost revenue, lost data, business interruption, or loss of goodwill,
              arising out of or relating to these Terms or your use of the Service, whether based
              on contract, tort, statute, or any other legal theory, and even if VauxVoice has
              been advised of the possibility of such damages.
            </p>
            <p className="mt-4">
              VauxVoice&apos;s total cumulative liability arising out of or relating to these
              Terms or the Service will not exceed the greater of (a) the amounts you actually
              paid to VauxVoice for the Service in the twelve (12) months immediately preceding
              the event giving rise to the claim, or (b) one hundred U.S. dollars (USD&nbsp;$100).
              These limitations apply even if a limited remedy fails of its essential purpose.
            </p>
          </section>

          {/* ── 13. Indemnification ────────────────────────────────── */}
          <section>
            <H2 n={13}>Indemnification</H2>
            <p>
              You agree to defend, indemnify, and hold VauxVoice and its directors, officers,
              employees, agents, and licensors harmless from and against any claims, demands,
              losses, damages, liabilities, costs, and expenses (including reasonable
              attorneys&apos; fees) arising from or relating to:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet marker="(a)">your use of the Service;</Bullet>
              <Bullet marker="(b)">Customer Data submitted by you or your callers;</Bullet>
              <Bullet marker="(c)">your violation of these Terms or any applicable law;</Bullet>
              <Bullet marker="(d)">
                your handling of PHI in violation of HIPAA, an applicable BAA, or other
                applicable law; or
              </Bullet>
              <Bullet marker="(e)">
                your infringement of any third-party right, including intellectual property or
                privacy rights.
              </Bullet>
            </ul>
            <p className="mt-4">
              We may, at our option, assume the exclusive defense and control of any matter
              subject to indemnification under this section, in which case you agree to cooperate
              with our defense.
            </p>
          </section>

          {/* ── 14. Term and Termination ───────────────────────────── */}
          <section>
            <H2 n={14}>Term and Termination</H2>
            <p>
              These Terms apply for as long as you have an account or are using the Service. We
              may suspend or terminate your access to the Service immediately, without notice, if
              (a) you breach these Terms; (b) you fail to pay fees when due; (c) we are required
              to do so by law; or (d) we reasonably believe your continued use poses a risk to
              other customers, the Service, or VauxVoice. You may terminate by cancelling your
              subscription as described in Section 5.
            </p>
            <p className="mt-4">
              Sections that by their nature should survive termination — including Customer Data
              ownership, Intellectual Property, Disclaimer of Warranties, Limitation of Liability,
              Indemnification, Governing Law, Dispute Resolution, and Miscellaneous — will survive
              any termination of these Terms.
            </p>
          </section>

          {/* ── 15. Changes to These Terms ─────────────────────────── */}
          <section>
            <H2 n={15}>Changes to These Terms</H2>
            <p>
              We may update these Terms from time to time. When we do, we will revise the{" "}
              <Em>&ldquo;Last updated&rdquo;</Em> date above and provide reasonable notice for
              material changes by email or through the Service. Your continued use of the Service
              after the updated Terms take effect constitutes your acceptance. If you do not agree
              to the updated Terms, you must stop using the Service and may cancel your
              subscription as described in Section 5.
            </p>
          </section>

          {/* ── 16. Governing Law ──────────────────────────────────── */}
          <section>
            <H2 n={16}>Governing Law</H2>
            <p>
              These Terms and any Dispute relating to your use of VauxVoice will be governed by
              the laws of the <Em>State of California</Em>, without regard to its
              conflict-of-laws rules. You irrevocably consent that the state and federal courts
              located in <Em>California</Em> will have exclusive jurisdiction to resolve any
              Dispute that is not subject to arbitration under Section 17 below.
            </p>
          </section>

          {/* ── 17. Dispute Resolution ─────────────────────────────── */}
          <section>
            <H2 n={17}>Dispute Resolution</H2>

            <H3>Informal Negotiations</H3>
            <p>
              To expedite resolution and control the cost of any dispute, controversy, or claim
              relating to these Terms or your use of VauxVoice (each, a{" "}
              <Em>&ldquo;Dispute&rdquo;</Em>, and collectively, the{" "}
              <Em>&ldquo;Disputes&rdquo;</Em>), brought by either you or VauxVoice (each a{" "}
              <Em>&ldquo;Party&rdquo;</Em>, and collectively the <Em>&ldquo;Parties&rdquo;</Em>),
              the Parties agree to first attempt to negotiate any Dispute (other than those
              expressly excluded below) informally for at least <Em>90 days</Em> before initiating
              arbitration. Such informal negotiations begin upon written notice from one Party to
              the other.
            </p>
            <p className="mt-4">
              For VauxVoice, written notice should be sent to{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>{" "}
              and to the mailing address in Section 20.
            </p>

            <H3>Binding Arbitration</H3>
            <p>
              If the Parties are unable to resolve a Dispute through informal negotiations, the
              Dispute (other than those expressly excluded below) will be finally and exclusively
              resolved by binding arbitration.
            </p>
            <p className="mt-4 font-medium text-sage-100 uppercase tracking-wide text-sm">
              You understand that without this provision, you would have the right to sue in
              court and have a jury trial.
            </p>
            <p className="mt-4">
              The arbitration will be commenced and conducted under the{" "}
              <Em>
                Commercial Arbitration Rules of the American Arbitration Association
                (&ldquo;AAA&rdquo;)
              </Em>{" "}
              and, where appropriate, the AAA&apos;s Supplementary Procedures for Consumer Related
              Disputes (the <Em>&ldquo;AAA Consumer Rules&rdquo;</Em>), both available at{" "}
              <a
                href="https://www.adr.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                adr.org
              </a>
              . Your arbitration fees and your share of arbitrator compensation will be governed
              by the AAA Consumer Rules and, where appropriate, limited by them.
            </p>
            <p className="mt-4">
              The arbitration may be conducted in person, by telephone, online, or by submission
              of documents. The arbitrator will issue a decision in writing but is not required to
              provide a statement of reasons unless requested by either Party. The arbitrator must
              apply applicable law, and any award may be challenged if the arbitrator fails to do
              so. Except where otherwise required by the applicable AAA rules or applicable law,
              the arbitration will take place in <Em>California</Em>.
            </p>
            <p className="mt-4">
              Except as otherwise provided in these Terms, the Parties may litigate in court to
              compel arbitration, stay proceedings pending arbitration, or to confirm, modify,
              vacate, or enter judgment on the award issued by the arbitrator.
            </p>
            <p className="mt-4">
              If for any reason a Dispute proceeds in court rather than in arbitration, it must
              be brought in the state and federal courts located in <Em>California</Em>, and the
              Parties consent to personal jurisdiction in those courts and waive any objection
              based on lack of personal jurisdiction or inconvenient forum. The United Nations
              Convention on Contracts for the International Sale of Goods and the Uniform Computer
              Information Transaction Act (UCITA) do not apply to these Terms.
            </p>
            <p className="mt-4">
              If this arbitration provision is found to be illegal or unenforceable, neither Party
              will elect to arbitrate any Dispute falling within that portion of the provision
              found to be illegal or unenforceable, and such Dispute will be decided by a court
              of competent jurisdiction in the courts identified above.
            </p>

            <H3>Restrictions</H3>
            <p>
              The Parties agree that any arbitration will be limited to the Dispute between the
              Parties individually. To the full extent permitted by law:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet marker="(a)">no arbitration may be joined with any other proceeding;</Bullet>
              <Bullet marker="(b)">
                there is no right or authority for any Dispute to be arbitrated on a class-action
                basis or to use class-action procedures; and
              </Bullet>
              <Bullet marker="(c)">
                there is no right or authority for any Dispute to be brought in a purported
                representative capacity on behalf of the general public or any other persons.
              </Bullet>
            </ul>

            <H3>Exceptions to Informal Negotiations and Arbitration</H3>
            <p>
              The Parties agree that the following Disputes are <Em>not</Em> subject to the
              informal negotiations and binding arbitration provisions above:
            </p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet marker="(a)">
                any Dispute seeking to enforce or protect, or concerning the validity of, any
                intellectual property right of a Party;
              </Bullet>
              <Bullet marker="(b)">
                any Dispute related to, or arising from, allegations of theft, piracy, invasion
                of privacy, or unauthorized use; and
              </Bullet>
              <Bullet marker="(c)">any claim for injunctive relief.</Bullet>
            </ul>
            <p className="mt-4">
              If this provision is found to be illegal or unenforceable, neither Party will elect
              to arbitrate any Dispute falling within that portion of the provision found to be
              illegal or unenforceable, and such Dispute will be decided by a court of competent
              jurisdiction in the courts identified above.
            </p>
          </section>

          {/* ── 18. Electronic Communications ──────────────────────── */}
          <section>
            <H2 n={18}>Electronic Communications</H2>
            <p>
              By using the Service, you consent to receive communications from us electronically —
              including notices, agreements, disclosures, and other communications — by email or
              through the Service. You agree that all electronic communications, agreements, and
              signatures satisfy any legal requirement that those records be in writing or signed.
            </p>
          </section>

          {/* ── 19. Miscellaneous ──────────────────────────────────── */}
          <section>
            <H2 n={19}>Miscellaneous</H2>
            <p>
              These Terms (together with any policies referenced in them, including our Privacy
              Policy and any BAA you have executed with us) form the entire agreement between you
              and VauxVoice with respect to the Service and supersede any prior or contemporaneous
              agreements. If any provision of these Terms is held to be unenforceable, the
              remaining provisions will continue in full force, and the unenforceable provision
              will be enforced to the maximum extent permitted by law.
            </p>
            <p className="mt-4">
              Our failure to enforce any provision is not a waiver of that provision. You may not
              assign or transfer these Terms or your rights under them without our prior written
              consent; we may assign these Terms freely. There is no joint venture, partnership,
              employment, or agency relationship between you and VauxVoice. Neither party will be
              liable for any failure or delay caused by events beyond its reasonable control.
            </p>
          </section>

          {/* ── 20. Contact ────────────────────────────────────────── */}
          <section>
            <H2 n={20}>Contact</H2>
            <p>
              For any questions about these Terms, or to start the informal negotiation process
              under Section 17, contact:
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
