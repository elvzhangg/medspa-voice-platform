"use client";

import { useState, useEffect } from "react";

interface ConnectionStatus {
  provider: string;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
  config: any;
}

export default function SchedulingSystemPage() {
  const [status, setStatus] = useState<ConnectionStatus>({
    provider: "internal",
    status: "disconnected",
    config: {}
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      const res = await fetch("/api/settings/scheduling-status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
      setLoading(false);
    }
    fetchStatus();
  }, []);

  async function handleConnect(provider: string, config: any) {
    setSaving(true);
    const res = await fetch("/api/settings/scheduling-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, config }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
    }
    setSaving(false);
  }

  if (loading) return <div className="p-10 text-center text-gray-400 font-medium italic animate-pulse">Loading scheduling engine...</div>;

  return (
    <div className="max-w-5xl">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Scheduling Engine</h1>
        <p className="text-sm text-gray-500 font-medium">Connect your clinical calendar to the AI brain.</p>
      </div>

      {/* Connection Status Card */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm mb-10">
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-inner ${
              status.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-400'
            }`}>
              {status.status === 'connected' ? '⚡' : '🔒'}
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                {status.status === 'connected' ? `Engine: ${status.provider}` : 'Pending Integration'}
              </h2>
              <p className="text-sm text-gray-500 font-medium">
                {status.status === 'connected'
                  ? `Your clinical calendar is fully synced. Our AI is actively reading and writing appointments.`
                  : 'Contact your VauxVoice account manager to link your Vagaro, Acuity, or Mindbody account.'
                }
              </p>
            </div>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
            status.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
          }`}>
            {status.status === 'connected' ? 'Active' : 'Contact Us to Activate'}
          </div>
        </div>
      </div>

      {/* Simplified Provider Grid (Read-Only) */}
      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Supported Clinical Integrations</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60 grayscale-[0.5]">
        <div className="p-8 rounded-3xl border border-gray-100 bg-white">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-2xl font-black italic mb-6">V</div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Vagaro</h4>
        </div>
        <div className="p-8 rounded-3xl border border-gray-100 bg-white">
          <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-2xl font-black mb-6">A</div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Acuity</h4>
        </div>
        <div className="p-8 rounded-3xl border border-dashed border-emerald-600 bg-emerald-50/10">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-black mb-6">V</div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight text-emerald-700">Vaux Internal</h4>
        </div>
      </div>
    </div>
  );
}
