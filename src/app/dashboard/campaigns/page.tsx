"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  calls_made: number;
  successful_bookings: number;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCampaignName }),
    });
    if (res.ok) {
      setIsCreating(false);
      setNewCampaignName("");
      fetchCampaigns();
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-serif text-3xl text-zinc-900">Outbound Campaigns</h1>
          <p className="text-sm text-zinc-500">Reach out to your past clients for reviews, re-bookings, or specials.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-white text-amber-900 border border-amber-400 shadow-sm font-bold rounded-lg hover:bg-[#fdf9ec] hover:border-amber-500 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
        >
          <span>+</span> New Campaign
        </button>
      </div>

      {isCreating && (
        <div className="mb-8 bg-white p-6 rounded-xl border-2 border-amber-200 shadow-sm">
          <h2 className="text-lg font-bold mb-4">Create Campaign</h2>
          <form onSubmit={handleCreate} className="flex gap-4">
            <input 
              placeholder="Campaign Name (e.g. Lip Flip Follow-up)" 
              className="flex-1 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-amber-400"
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              required
            />
            <button type="submit" className="px-6 py-2 bg-white text-amber-900 border border-amber-400 shadow-sm rounded-lg font-bold">Create</button>
            <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-zinc-500">Cancel</button>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-400">Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <div className="bg-white p-16 rounded-xl border border-zinc-200 text-center">
          <div className="w-16 h-16 bg-[#fdf9ec] text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📞</div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1">No campaigns found</h3>
          <p className="text-zinc-500 text-sm mb-6">Create your first outbound campaign to start automating your follow-ups.</p>
          <button onClick={() => setIsCreating(true)} className="text-amber-700 font-bold hover:underline">Start a campaign →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map(cp => (
            <div key={cp.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-zinc-900">{cp.name}</h3>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    cp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {cp.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Leads</p>
                    <p className="text-xl font-black text-zinc-900">{cp.total_leads}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Calls</p>
                    <p className="text-xl font-black text-zinc-900">{cp.calls_made}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Booked</p>
                    <p className="text-xl font-black text-amber-700">{cp.successful_bookings}</p>
                  </div>
                </div>

                <Link
                  href={`/dashboard/campaigns/${cp.id}`}
                  className="block w-full text-center py-2 bg-white text-amber-900 border border-amber-400 shadow-sm rounded-lg text-sm font-bold hover:bg-[#fdf9ec] hover:border-amber-500 transition-all shadow-sm shadow-amber-100"
                >
                  Open Campaign
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
