import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — VauxVoice",
  description:
    "VauxVoice's Privacy Policy describes how we collect, use, and disclose information about visitors and customers of the VauxVoice platform.",
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
   Reusable section primitives
═══════════════════════════════════════════════════════════════════ */
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-2xl font-medium text-sage-100 tracking-[-0.005em] mb-4">
      {children}
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-em-400 shrink-0 font-medium">•</span>
      <span>{children}</span>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════════════ */
export default function PrivacyPage() {
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
            Privacy <span className="italic">Policy</span>
          </h1>
          <p className="text-sage-400 text-sm">
            VauxVoice, Inc. &middot; Last updated May 7, 2026
          </p>
        </header>

        {/* Body */}
        <article className="space-y-10 text-sage-300 text-[15px] leading-[1.75]">

          {/* ── Intro ──────────────────────────────────────────────── */}
          <section>
            <p>
              <Em>VauxVoice, Inc.</Em> (<Em>&ldquo;VauxVoice&rdquo;</Em>,{" "}
              <Em>&ldquo;we&rdquo;</Em>, <Em>&ldquo;our&rdquo;</Em>, or <Em>&ldquo;us&rdquo;</Em>)
              respects the privacy of individuals who visit our website and use our platform
              (collectively, the <Em>&ldquo;Services&rdquo;</Em>). This Privacy Policy describes
              how we collect, use, and share information about users of the Services (
              <Em>&ldquo;Users&rdquo;</Em>). By using the Services, you agree to the practices
              described here. Your use of the Services is also subject to our{" "}
              <Link
                href="/terms"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                Terms of Service
              </Link>
              .
            </p>
            <p className="mt-4">
              This Privacy Policy does <Em>not</Em> apply when we process information as a
              service provider or processor on behalf of our business customers — for example,
              call recordings, transcripts, appointment data, or other end-customer information
              we handle on behalf of a medical spa or other healthcare business that uses the
              Services. In those cases, our customer is the data controller, and that
              customer&apos;s privacy practices apply to the processing of the underlying personal
              information. We are not responsible for the privacy or data-security practices of
              our customers, which may differ from those described in this Privacy Policy.
            </p>
          </section>

          {/* ── Information We Collect ─────────────────────────────── */}
          <section>
            <H2>Information We Collect</H2>
            <p>
              We may collect a range of information from or about you and your devices through
              the sources described below.
            </p>

            <H3>A. Information You Provide to Us</H3>
            <p>
              <Em>Communications.</Em> If you contact us directly — by email, chat, or otherwise —
              we may receive your name, email address, phone number, the contents of your
              message, any attachments, and any other information you choose to provide. When we
              send you email, we may use embedded pixels and similar technologies to understand
              whether and when you open it, whether you click links, how long you read, and
              whether you forward it, so we can improve how we communicate.
            </p>
            <p className="mt-4">
              <Em>Forms and Demo Requests.</Em> When you submit a contact form or request a demo
              through the Services, we may collect information such as your name, email address,
              phone number, business name, role, the size of your business, the booking software
              you use, and any message you choose to provide.
            </p>
            <p className="mt-4">
              <Em>Account Information.</Em> If you create an account or sign up for a
              subscription, we collect the information needed to set up and manage your account,
              including login credentials, billing details (handled by our third-party payment
              processor), and any configuration you provide as part of onboarding (for example,
              business name, services offered, pricing, knowledge-base content, staff names, and
              integration settings).
            </p>
            <p className="mt-4">
              <Em>Careers.</Em> If you apply for a job with VauxVoice, we collect the contact
              information, resume, and any additional materials you submit, whether through our
              website, by email, or through a third-party hiring service. We use this information
              to evaluate your application.
            </p>

            <H3>B. Information We Collect Automatically When You Use the Services</H3>
            <p>
              <Em>Device Information.</Em> We receive information about the device and software
              you use to access the Services, including IP address (which can indicate your
              general location), device type, device identifiers, browser type and version, and
              operating-system version.
            </p>
            <p className="mt-4">
              <Em>Usage Information.</Em> We automatically receive information about how you
              interact with the Services — including pages and content you view, the pages or
              websites you visited before arriving (referrer information), and the dates and
              times of your visits.
            </p>
            <p className="mt-4">
              <Em>Cookies and Similar Technologies.</Em> We and our third-party partners use
              cookies, pixel tags, SDKs, and similar tracking technologies to collect information
              about your activities on the Services. Some of our partners — such as analytics,
              advertising, and security providers — may use these technologies to collect
              information about your online activity over time and across different sites and
              services.
            </p>
          </section>

          {/* ── How We Use Information ─────────────────────────────── */}
          <section>
            <H2>How We Use the Information We Collect</H2>
            <p>We use the information we collect:</p>
            <ul className="mt-4 space-y-3 list-none">
              <Bullet>to provide, maintain, secure, improve, and develop the Services;</Bullet>
              <Bullet>
                to understand how Users interact with the Services and to develop new features,
                products, and functionality;
              </Bullet>
              <Bullet>
                to communicate with you, including to respond to questions, deliver updates and
                requested information, and provide customer support;
              </Bullet>
              <Bullet>
                for marketing and advertising purposes, including sending promotional emails,
                running campaigns, and creating materials we believe may be of interest to you;
              </Bullet>
              <Bullet>
                to generate de-identified or aggregated data that no longer identifies any
                individual, which we may use for any lawful purpose, including publishing reports
                or improving our models;
              </Bullet>
              <Bullet>to send you SMS messages where you have consented to receive them;</Bullet>
              <Bullet>to process transactions and payments;</Bullet>
              <Bullet>
                to detect, investigate, and prevent fraud, abuse, security incidents, and other
                trust-and-safety issues;
              </Bullet>
              <Bullet>
                to comply with applicable law, enforce our Terms of Service or other legal rights,
                and respond to lawful requests from courts, regulators, or government agencies;
                and
              </Bullet>
              <Bullet>
                for any other purpose disclosed to you at the time the information is collected.
              </Bullet>
            </ul>
          </section>

          {/* ── How We Share Information ───────────────────────────── */}
          <section>
            <H2>How We Disclose the Information We Collect</H2>

            <H3>Affiliates</H3>
            <p>
              We may share information with our current or future affiliates for any of the
              purposes described in this Privacy Policy.
            </p>

            <H3>Vendors and Service Providers</H3>
            <p>
              We may share information with vendors and service providers who help us operate the
              Services. These currently include providers of voice infrastructure, large language
              models, voice synthesis, hosting, data storage, customer-support tooling, payment
              processing, email delivery, and analytics. These providers act on our behalf and
              are subject to obligations to protect the information we share with them.
            </p>

            <H3>Analytics Partners</H3>
            <p>
              We use analytics services (such as Google Analytics) to understand how the Services
              are used. You can learn more about Google&apos;s data practices at{" "}
              <a
                href="https://www.google.com/policies/privacy/partners/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                google.com/policies/privacy/partners
              </a>
              .
            </p>

            <H3>Advertising Partners</H3>
            <p>
              We may work with third-party advertising partners to show ads we believe may
              interest you. Some of these partners participate in industry self-regulatory
              programs such as the Network Advertising Initiative (
              <a
                href="https://optout.networkadvertising.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                optout.networkadvertising.org
              </a>
              ) or the Digital Advertising Alliance (
              <a
                href="https://optout.aboutads.info"
                target="_blank"
                rel="noopener noreferrer"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                optout.aboutads.info
              </a>
              ), and you can use those programs to opt out of certain cookie-based advertising
              from member companies. These opt-outs may not apply to advertising delivered
              through non-cookie-based technologies.
            </p>

            <H3>Legal Disclosures</H3>
            <p>
              We may access, preserve, and disclose information when we believe in good faith
              that doing so is necessary or appropriate to: (a) comply with applicable law, legal
              process, or law-enforcement requests (such as a subpoena or court order); (b)
              respond to your requests; or (c) protect the rights, property, or safety of
              VauxVoice, our Users, or others.
            </p>

            <H3>Business Transfers</H3>
            <p>
              If VauxVoice is involved in a merger, acquisition, financing, reorganization, sale
              of assets, or insolvency event, we may share information with advisors, potential
              transactional partners, or successors as part of that process. Information shared
              in connection with any such event will continue to be protected in accordance with
              the version of this Privacy Policy in effect when the information was collected,
              until any applicable updates are posted.
            </p>

            <H3>With Your Consent</H3>
            <p>We may share information with your permission or at your direction.</p>
          </section>

          {/* ── Your Choices ───────────────────────────────────────── */}
          <section>
            <H2>Your Choices</H2>
            <p>
              <Em>Marketing Communications.</Em> You can unsubscribe from our marketing emails by
              following the unsubscribe link in any email we send. Even if you opt out of
              promotional emails, you may continue to receive administrative messages from us
              (for example, billing notices, security alerts, or messages about changes to the
              Services).
            </p>
            <p className="mt-4">
              <Em>Cookies.</Em> Most browsers allow you to refuse cookies or alert you when
              cookies are being sent. If you reject cookies, some parts of the Services may not
              function as intended.
            </p>
          </section>

          {/* ── Third-Party Sites ──────────────────────────────────── */}
          <section>
            <H2>Third-Party Sites and Services</H2>
            <p>
              The Services may contain links to other websites, products, or services that we do
              not own or operate. This Privacy Policy does not apply to those third-party
              services, and we are not responsible for their privacy practices. We encourage you
              to review their privacy policies before sharing any information with them.
            </p>
          </section>

          {/* ── Security ───────────────────────────────────────────── */}
          <section>
            <H2>Security</H2>
            <p>
              We use reasonable physical, technical, and administrative safeguards designed to
              protect the information we maintain. However, no system of transmission or storage
              over the internet can be guaranteed to be entirely secure, and we cannot guarantee
              the absolute security of your information.
            </p>
          </section>

          {/* ── Children ───────────────────────────────────────────── */}
          <section>
            <H2>Children&apos;s Privacy</H2>
            <p>
              The Services are not directed to children under 18, and we do not knowingly
              collect, maintain, or use personal information from anyone under 18. If you become
              aware that a child has provided personal information to us in violation of this
              Privacy Policy, please notify us at{" "}
              <a
                href="mailto:founders@vauxvoice.com"
                className="text-em-400 hover:text-em-300 underline-offset-4 hover:underline"
              >
                founders@vauxvoice.com
              </a>{" "}
              and we will take reasonable steps to delete the information.
            </p>
          </section>

          {/* ── International Visitors ─────────────────────────────── */}
          <section>
            <H2>International Visitors</H2>
            <p>
              The Services are hosted in the United States and intended for visitors located in
              the United States. If you access the Services from the European Union, the United
              Kingdom, or any other region with data-protection laws that differ from U.S. law,
              please be aware that you are transferring your personal information to the United
              States for storage and processing. We may also transfer your information to other
              countries or regions in connection with operating the Services and fulfilling your
              requests. By using the Services, you consent to that transfer, storage, and
              processing.
            </p>
          </section>

          {/* ── Changes ────────────────────────────────────────────── */}
          <section>
            <H2>Changes to this Privacy Policy</H2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the{" "}
              <Em>&ldquo;Last updated&rdquo;</Em> date above, and the revised version takes
              effect when posted. If we make material changes to how we use or share previously
              collected personal information, we will provide additional notice through the
              Services, by email, or by other reasonable means.
            </p>
          </section>

          {/* ── Contact ────────────────────────────────────────────── */}
          <section>
            <H2>Contact</H2>
            <p>
              If you have any questions, comments, or concerns about this Privacy Policy or our
              data practices, please contact us:
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
