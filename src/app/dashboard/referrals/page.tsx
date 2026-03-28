"use client";

import { useEffect, useState } from "react";

interface Referral {
  id: string;
  referred_by_name: string | null;
  referred_by_phone: string | null;
  new_patient_name: string | null;
  new_patient_phone: string | null;
  source: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  rewarded: "bg-purple-100 text-purple-700",
};

const SOURCE_STYLES: Record<string, string> = {
  phone: "bg-blue-100 text-blue-700",
  manual: "bg-gray-100 text-gray-700",
  campaign: "bg-orange-100 text-orange-700",
};

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    referred_by_name: "",
    referred_by_phone: "",
    new_patient_name: "",
    new_patient_phone: "",
    source: "manual",
    notes: "",
  });

  const fetchReferrals = async () => {
    try {
      const res = await fetch("/api/referrals");
      const data = await res.json();
      setReferrals(data.referrals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, []);

  const stats = {
    total: referrals.length,
    pending: referrals.filter((r) => r.status === "pending").length,
    completed: referrals.filter((r) => r.status === "completed").length,
    rewarded: referrals.filter((r) => r.status === "rewarded").length,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ referred_by_name: "", referred_by_phone: "", new_patient_name: "", new_patient_phone: "", source: "manual", notes: "" });
        setShowForm(false);
        await fetchReferrals();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await fetchReferrals();
  };

  const deleteReferral = async (id: string) => {
    if (!confirm("Delete this referral?")) return;
    await fetch(`/api/referrals?id=${id}`, { method: "DELETE" });
    await fetchReferrals();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referral Management</h1>
          <p className="text-gray-500 mt-1">Track patient referrals from your AI receptionist and manual entries</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Referral
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-gray-900" },
          { label: "Pending", value: stats.pending, color: "text-yellow-600" },
          { label: "Completed", value: stats.completed, color: "text-green-600" },
          { label: "Rewarded", value: stats.rewarded, color: "text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{loading ? "—" : s.value}</p>
          </div>
        ))}
      </div>

      {/* Add referral form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Add New Referral</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Referred By (Name)</label>
                <input
                  type="text"
                  value={form.referred_by_name}
                  onChange={(e) => setForm({ ...form, referred_by_name: e.target.value })}
                  placeholder="Sarah Johnson"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Referrer Phone</label>
                <input
                  type="tel"
                  value={form.referred_by_phone}
                  onChange={(e) => setForm({ ...form, referred_by_phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Patient (Name)</label>
                <input
                  type="text"
                  value={form.new_patient_name}
                  onChange={(e) => setForm({ ...form, new_patient_name: e.target.value })}
                  placeholder="Alex Smith"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Patient Phone</label>
                <input
                  type="tel"
                  value={form.new_patient_phone}
                  onChange={(e) => setForm({ ...form, new_patient_phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="phone">Phone Call</option>
                  <option value="campaign">Campaign</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Referral"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-gray-600 px-5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Referrals table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">All Referrals</h2>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : referrals.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-1">No referrals yet</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              Referrals will appear here when your AI receptionist logs them during calls, or when you add them manually.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Referred By</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">New Patient</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Source</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Status</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Date</th>
                  <th className="text-left font-medium text-gray-500 pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{r.referred_by_name || "—"}</p>
                      {r.referred_by_phone && <p className="text-xs text-gray-400">{r.referred_by_phone}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{r.new_patient_name || "—"}</p>
                      {r.new_patient_phone && <p className="text-xs text-gray-400">{r.new_patient_phone}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_STYLES[r.source] || "bg-gray-100 text-gray-600"}`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] || "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {r.status === "pending" && (
                          <button
                            onClick={() => updateStatus(r.id, "completed")}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            Complete
                          </button>
                        )}
                        {r.status === "completed" && (
                          <button
                            onClick={() => updateStatus(r.id, "rewarded")}
                            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                          >
                            Reward
                          </button>
                        )}
                        <button
                          onClick={() => deleteReferral(r.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
