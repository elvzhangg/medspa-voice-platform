"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  voice_id: string;
  greeting_message: string;
  vapi_assistant_id?: string;
  created_at: string;
  updated_at: string;
}

interface CallLog {
  id: string;
  caller_number: string;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
}

interface TenantDetailResponse {
  tenant: TenantDetail;
  kbCount: number;
  calls: CallLog[];
  referralCount: number;
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<TenantDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then((res) => res.json())
      .then((d: TenantDetailResponse) => {
        setData(d);
        setEditName(d.tenant.name);
        setEditPhone(d.tenant.phone_number);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load tenant");
        setLoading(false);
      });
  }, [id]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveError("");

    const res = await fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName, phone_number: editPhone }),
    });

    if (res.ok) {
      const updated = await res.json() as { tenant: TenantDetail };
      setData({ ...data, tenant: updated.tenant });
      setEditing(false);
    } else {
      setSaveError("Failed to save changes");
    }
    setSaving(false);
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>;
  if (error || !data) return <div className="text-red-500 text-sm">{error || "Not found"}</div>;

  const { tenant, kbCount, calls, referralCount } = data;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/tenants"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Tenants
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-900 font-medium">{tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
          <p className="text-gray-500 text-sm mt-1 font-mono">{tenant.slug}</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Stat chips */}
      <div className="flex gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex-1 text-center">
          <p className="text-2xl font-bold text-gray-900">{kbCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">KB Documents</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex-1 text-center">
          <p className="text-2xl font-bold text-gray-900">{calls.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Recent Calls</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex-1 text-center">
          <p className="text-2xl font-bold text-gray-900">{referralCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Referrals</p>
        </div>
      </div>

      {/* Tenant info / edit form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenant Info</h2>
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Business Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {saveError && <p className="text-red-500 text-xs">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditName(tenant.name);
                  setEditPhone(tenant.phone_number);
                  setSaveError("");
                }}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Phone Number</dt>
              <dd className="text-gray-900 font-medium">{tenant.phone_number}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Voice ID</dt>
              <dd className="text-gray-900 font-mono text-xs">{tenant.voice_id}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-500 text-xs mb-0.5">Greeting Message</dt>
              <dd className="text-gray-900">{tenant.greeting_message}</dd>
            </div>
            {tenant.vapi_assistant_id && (
              <div className="col-span-2">
                <dt className="text-gray-500 text-xs mb-0.5">Vapi Assistant ID</dt>
                <dd className="text-gray-900 font-mono text-xs">{tenant.vapi_assistant_id}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Created</dt>
              <dd className="text-gray-900">{new Date(tenant.created_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Updated</dt>
              <dd className="text-gray-900">{new Date(tenant.updated_at).toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Recent Calls (last 10)</h2>
        </div>
        {calls.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">No calls logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Caller</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Duration</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Summary</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {calls.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-900 font-mono text-xs">{c.caller_number}</td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {c.duration_seconds != null ? `${c.duration_seconds}s` : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">
                    {c.summary || "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
