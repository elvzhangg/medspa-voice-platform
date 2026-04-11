"use client";

import { useState, useEffect, use } from "react";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  status: string;
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsCreating] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const res = await fetch(`/api/campaigns/${id}/leads`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
    }
    setLoading(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").slice(1); // skip header
      const newLeads = lines.map(line => {
        const [first, last, phone] = line.split(",");
        return { first_name: first, last_name: last, phone_number: phone };
      }).filter(l => l.phone_number);

      const res = await fetch(`/api/campaigns/${id}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: newLeads }),
      });

      if (res.ok) {
        setIsCreating(false);
        fetchLeads();
      }
    };
    reader.readAsText(file);
  }

  async function triggerCalls() {
    if (!confirm(`Are you sure you want to start calling ${leads.length} leads?`)) return;
    await fetch(`/api/campaigns/${id}/trigger`, { method: "POST" });
    alert("Campaign started! The AI is now dialing sequence.");
    fetchLeads();
  }

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Campaign Management</h1>
          <p className="text-sm text-gray-500">Upload leads and trigger automated outbound sequences.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 shadow-sm"
          >
            Import CSV
          </button>
          <button 
            onClick={triggerCalls}
            className="px-6 py-2 bg-indigo-600 text-white font-black rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 uppercase tracking-widest text-xs"
          >
            🚀 Start sequence
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="mb-8 bg-indigo-50 p-8 rounded-2xl border-2 border-dashed border-indigo-200 text-center">
          <h2 className="text-lg font-bold text-indigo-900 mb-2">Upload Lead List (CSV)</h2>
          <p className="text-xs text-indigo-600 mb-6 font-medium">Format: first_name, last_name, phone_number</p>
          <form onSubmit={handleUpload} className="space-y-4">
            <input 
              type="file" 
              accept=".csv"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
            />
            <div className="flex justify-center gap-2">
              <button type="submit" className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-bold">Upload leads</button>
              <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-gray-500">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-left font-black text-gray-400 uppercase tracking-widest text-[10px]">Name</th>
              <th className="px-6 py-4 text-left font-black text-gray-400 uppercase tracking-widest text-[10px]">Phone</th>
              <th className="px-6 py-4 text-left font-black text-gray-400 uppercase tracking-widest text-[10px]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-bold text-gray-900">{lead.first_name} {lead.last_name}</td>
                <td className="px-6 py-4 text-gray-500">{lead.phone_number}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${
                    lead.status === 'booked' ? 'bg-emerald-100 text-emerald-700' : 
                    lead.status === 'pending' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {lead.status}
                  </span>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-20 text-center text-gray-400 font-medium italic">No leads in this campaign yet. Upload a CSV to get started!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
