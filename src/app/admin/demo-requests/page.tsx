"use client";

import { useState, useEffect } from "react";

interface DemoRequest {
  id: string;
  name: string;
  email: string;
  business_name: string;
  phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "contacted", label: "Mark Contacted", activeColor: "bg-blue-600 hover:bg-blue-700" },
  { value: "converted", label: "Mark Converted", activeColor: "bg-green-600 hover:bg-green-700" },
  { value: "archived", label: "Archive", activeColor: "bg-gray-600 hover:bg-gray-700" },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: "bg-yellow-100 text-yellow-800",
    contacted: "bg-blue-100 text-blue-800",
    converted: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function RequestRow({
  r,
  onUpdate,
}: {
  r: DemoRequest;
  onUpdate: (updated: DemoRequest) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(r.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);

  async function updateStatus(status: string) {
    setUpdating(true);
    const res = await fetch("/api/admin/demo-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, status }),
    });
    if (res.ok) {
      const data = await res.json() as { request: DemoRequest };
      onUpdate(data.request);
    }
    setUpdating(false);
  }

  async function saveNotes() {
    setSaving(true);
    const res = await fetch("/api/admin/demo-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, notes }),
    });
    if (res.ok) {
      const data = await res.json() as { request: DemoRequest };
      onUpdate(data.request);
    }
    setSaving(false);
  }

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-gray-900 font-medium">{r.name}</td>
        <td className="px-4 py-3 text-gray-600 text-sm">{r.email}</td>
        <td className="px-4 py-3 text-gray-700 font-medium">{r.business_name}</td>
        <td className="px-4 py-3 text-gray-600 text-sm">{r.phone || "—"}</td>
        <td className="px-4 py-3">
          <StatusBadge status={r.status} />
        </td>
        <td className="px-4 py-3 text-gray-400 text-xs">
          {new Date(r.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? "Collapse" : "Manage"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-t border-gray-100">
          <td colSpan={7} className="px-4 py-4">
            <div className="flex flex-col gap-3">
              {/* Status actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium mr-1">Update status:</span>
                {STATUS_OPTIONS.filter((s) => s.value !== r.status).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateStatus(opt.value)}
                    disabled={updating}
                    className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 ${opt.activeColor}`}
                  >
                    {opt.label}
                  </button>
                ))}
                {r.status !== "new" && (
                  <button
                    onClick={() => updateStatus("new")}
                    disabled={updating}
                    className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-white transition-colors disabled:opacity-50"
                  >
                    Reset to New
                  </button>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <div className="flex gap-2">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Add internal notes..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    onClick={saveNotes}
                    disabled={saving}
                    className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors self-start"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
                {r.notes && notes === r.notes && (
                  <p className="text-xs text-gray-400 mt-1">Saved: {r.notes}</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/demo-requests")
      .then((res) => res.json())
      .then((data: { requests: DemoRequest[] }) => {
        setRequests(data.requests || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleUpdate(updated: DemoRequest) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  const newCount = requests.filter((r) => r.status === "new").length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Demo Requests</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Leads from the homepage form
          {newCount > 0 && (
            <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded">
              {newCount} new
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium mb-1">No demo requests yet</p>
          <p className="text-sm">They will appear here when people submit the form.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Business</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <RequestRow key={r.id} r={r} onUpdate={handleUpdate} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
