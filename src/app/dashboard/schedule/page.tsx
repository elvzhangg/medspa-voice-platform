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
              status.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'
            }`}>
              {status.status === 'connected' ? '⚡' : '🔌'}
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                {status.status === 'connected' ? `Connected to ${status.provider}` : 'No System Connected'}
              </h2>
              <p className="text-sm text-gray-500 font-medium">
                {status.status === 'connected' 
                  ? `AI is actively reading & writing to your ${status.provider} calendar.`
                  : 'AI is currently using the Vaux internal fallback calendar.'
                }
              </p>
            </div>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
            status.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {status.status}
          </div>
        </div>
      </div>

      {/* Provider Grid */}
      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Choose Your Clinical System</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Vagaro */}
        <div className={`p-8 rounded-3xl border-2 transition-all cursor-pointer hover:shadow-xl ${
          status.provider === 'vagaro' ? 'border-indigo-600 bg-white' : 'border-gray-100 bg-white'
        }`} onClick={() => setStatus({...status, provider: 'vagaro'})}>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-2xl font-black italic">V</div>
            {status.provider === 'vagaro' && <div className="text-indigo-600 font-black">✓</div>}
          </div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Vagaro</h4>
          <p className="text-xs text-gray-500 font-medium mb-6">Professional scheduling, EMR, and POS for boutiques.</p>
          
          {status.provider === 'vagaro' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <input 
                placeholder="Merchant ID" 
                className="w-full px-4 py-2 bg-gray-50 border rounded-xl text-sm"
                defaultValue={status.config.merchantId}
                id="vagaro-id"
              />
              <input 
                placeholder="API Key" 
                type="password"
                className="w-full px-4 py-2 bg-gray-50 border rounded-xl text-sm"
                defaultValue={status.config.apiKey}
                id="vagaro-key"
              />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleConnect('vagaro', { 
                    merchantId: (document.getElementById('vagaro-id') as HTMLInputElement).value, 
                    apiKey: (document.getElementById('vagaro-key') as HTMLInputElement).value 
                  });
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100"
              >
                {saving ? 'Syncing...' : 'Sync Vagaro'}
              </button>
            </div>
          )}
        </div>

        {/* Acuity */}
        <div className={`p-8 rounded-3xl border-2 transition-all cursor-pointer hover:shadow-xl ${
          status.provider === 'acuity' ? 'border-indigo-600 bg-white' : 'border-gray-100 bg-white'
        }`} onClick={() => setStatus({...status, provider: 'acuity'})}>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-2xl font-black">A</div>
            {status.provider === 'acuity' && <div className="text-indigo-600 font-black">✓</div>}
          </div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Acuity</h4>
          <p className="text-xs text-gray-500 font-medium mb-6">Modern scheduling engine by Squarespace.</p>
          
          {status.provider === 'acuity' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <input 
                placeholder="User ID" 
                className="w-full px-4 py-2 bg-gray-50 border rounded-xl text-sm"
                defaultValue={status.config.userId}
                id="acuity-id"
              />
              <input 
                placeholder="API Key" 
                type="password"
                className="w-full px-4 py-2 bg-gray-50 border rounded-xl text-sm"
                defaultValue={status.config.apiKey}
                id="acuity-key"
              />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleConnect('acuity', { 
                    userId: (document.getElementById('acuity-id') as HTMLInputElement).value, 
                    apiKey: (document.getElementById('acuity-key') as HTMLInputElement).value 
                  });
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100"
              >
                {saving ? 'Syncing...' : 'Sync Acuity'}
              </button>
            </div>
          )}
        </div>

        {/* Internal / Fallback */}
        <div className={`p-8 rounded-3xl border-2 border-dashed transition-all cursor-pointer hover:shadow-xl ${
          status.provider === 'internal' ? 'border-emerald-600 bg-emerald-50/20' : 'border-gray-200 bg-white'
        }`} onClick={() => handleConnect('internal', {})}>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-black">V</div>
            {status.provider === 'internal' && <div className="text-emerald-600 font-black">✓</div>}
          </div>
          <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Vaux Internal</h4>
          <p className="text-xs text-gray-500 font-medium">Use our simple built-in calendar for new clinics.</p>
        </div>
      </div>
    </div>
  );
}
