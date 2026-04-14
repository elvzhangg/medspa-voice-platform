"use client";

import Link from "next/link";

export default function GlowMedSpaLanding() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#2d2d2d] font-sans">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
        <div className="text-2xl font-serif tracking-tighter text-indigo-900">
          GLOW<span className="font-light italic text-indigo-400">MedSpa</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium uppercase tracking-widest text-gray-500">
          <Link href="#services" className="hover:text-indigo-600 transition-colors">Services</Link>
          <Link href="#about" className="hover:text-indigo-600 transition-colors">About</Link>
          <Link href="#location" className="hover:text-indigo-600 transition-colors">Location</Link>
        </div>
        <Link 
          href="/glow-med-spa/dashboard/schedule" 
          className="bg-indigo-900 text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-indigo-800 transition-transform hover:scale-105"
        >
          Book Now
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="px-8 py-20 md:py-32 max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-1000">
          <h1 className="text-5xl md:text-7xl font-serif leading-tight">
            Reveal your <br/> 
            <span className="italic text-indigo-400">natural radiance.</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-md leading-relaxed">
            Experience the next generation of aesthetic care. Medical-grade treatments delivered with surgical precision and a gentle touch.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button className="bg-indigo-900 text-white px-10 py-5 rounded-full font-bold text-sm uppercase tracking-widest hover:shadow-2xl hover:shadow-indigo-200 transition-all">
              Schedule Consultation
            </button>
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="flex -space-x-3">
                {[1,2,3].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200" />
                ))}
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                500+ Happy Patients
              </p>
            </div>
          </div>
        </div>
        <div className="relative group animate-in fade-in slide-in-from-right-4 duration-1000">
          <div className="aspect-[4/5] bg-indigo-100 rounded-[40px] overflow-hidden shadow-2xl relative z-10">
             {/* Imagine a beautiful, soft-lit med spa interior photo here */}
             <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/20 to-transparent" />
          </div>
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-indigo-400 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity" />
          <div className="absolute top-10 right-10 z-20 bg-white/90 backdrop-blur-md p-6 rounded-3xl shadow-xl flex items-center gap-4 border border-white/50">
            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">✓</div>
            <div>
              <p className="text-xs font-black uppercase text-gray-400">Available Today</p>
              <p className="text-sm font-bold">2 PM with Nurse Sarah</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section id="services" className="bg-white py-24 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-4">Our Expertise</h2>
            <h3 className="text-4xl font-serif">Curated Aesthetic Services</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Neurotoxins", desc: "Smooth fine lines and wrinkles with Botox and Dysport.", price: "from $12/unit" },
              { title: "Dermal Fillers", desc: "Restore volume and contour with Juvederm and Restylane.", price: "from $650/syringe" },
              { title: "Skin Rejuvenation", desc: "Microneedling and chemical peels for a perfect glow.", price: "from $250" },
            ].map((s, i) => (
              <div key={i} className="group p-8 rounded-3xl bg-[#faf9f6] hover:bg-indigo-900 hover:text-white transition-all duration-500 cursor-pointer border border-gray-100">
                <h4 className="text-xl font-bold mb-4">{s.title}</h4>
                <p className="text-sm opacity-70 mb-8 leading-relaxed">{s.desc}</p>
                <p className="text-xs font-black uppercase tracking-widest">{s.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Quote */}
      <section className="py-24 px-8 max-w-4xl mx-auto text-center">
        <p className="text-3xl md:text-4xl font-serif italic text-indigo-900/80 leading-snug">
          "Beauty is about being the best version of yourself, from the inside out."
        </p>
        <div className="mt-8 flex justify-center items-center gap-4">
          <div className="w-12 h-[1px] bg-indigo-200" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sarah Miller, Lead Injector</span>
          <div className="w-12 h-[1px] bg-indigo-200" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xl font-serif tracking-tighter text-indigo-900">
            GLOW<span className="font-light italic text-indigo-400">MedSpa</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            © 2026 Glow Med Spa. Powered by VauxVoice AI.
          </div>
          <div className="flex gap-6">
            {/* Social Icons Placeholder */}
            <div className="w-5 h-5 rounded-full bg-gray-200" />
            <div className="w-5 h-5 rounded-full bg-gray-200" />
          </div>
        </div>
      </footer>
    </div>
  );
}
