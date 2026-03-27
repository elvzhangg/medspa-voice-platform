"use client";

import { useState } from "react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✨</span>
            <span className="font-semibold text-gray-900">MedSpa Voice</span>
          </div>
          <a
            href="#demo"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Request Demo
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          AI Receptionist for Your Med Spa
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Never miss a call again. Our AI answers 24/7, books appointments, and knows
          everything about your services — so your team can focus on clients.
        </p>
        <a
          href="#demo"
          className="inline-block px-8 py-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors text-lg"
        >
          Get Started — Request a Demo
        </a>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              number="1"
              title="We Learn Your Business"
              description="Share your services, pricing, and policies. We train your AI receptionist on everything."
            />
            <Step
              number="2"
              title="Get Your Phone Number"
              description="We set up a dedicated phone number for your med spa. Forward your existing line or use it directly."
            />
            <Step
              number="3"
              title="Go Live in Days"
              description="Your AI receptionist starts answering calls, booking appointments, and delighting customers."
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Why Med Spas Love Us
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Feature
              emoji="📞"
              title="24/7 Availability"
              description="Never miss a lead. Calls answered at 2am, on holidays, whenever."
            />
            <Feature
              emoji="🧠"
              title="Knows Your Services"
              description="Botox pricing, laser packages, cancellation policies — it knows it all."
            />
            <Feature
              emoji="📅"
              title="Books Appointments"
              description="Collects customer info and schedules appointments directly."
            />
            <Feature
              emoji="🎙️"
              title="Natural Voice"
              description="Sounds like a real person, not a robot. Powered by ElevenLabs."
            />
            <Feature
              emoji="📊"
              title="Call Dashboard"
              description="See every call, transcript, and outcome in your dashboard."
            />
            <Feature
              emoji="⚡"
              title="Fast Setup"
              description="Go live in days, not months. No complex integrations required."
            />
          </div>
        </div>
      </section>

      {/* Demo Form */}
      <section id="demo" className="bg-indigo-600 py-20">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Ready to Try It?
          </h2>
          <p className="text-indigo-100 text-center mb-8">
            Fill out the form and we&apos;ll set up a personalized demo for your med spa.
          </p>
          <DemoForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-500 text-sm">
          © 2026 MedSpa Voice. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function Feature({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <div className="text-3xl mb-3">{emoji}</div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
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
      <div className="bg-white rounded-xl p-8 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Thank you!</h3>
        <p className="text-gray-600">We&apos;ll be in touch within 24 hours to schedule your demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Med Spa Name</label>
        <input
          type="text"
          required
          value={form.business_name}
          onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {status === "loading" ? "Submitting..." : "Request Demo"}
      </button>
      {status === "error" && (
        <p className="text-red-500 text-sm text-center">Something went wrong. Please try again.</p>
      )}
    </form>
  );
}
