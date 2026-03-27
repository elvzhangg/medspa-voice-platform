"use client";

import { useState, useEffect } from "react";

interface DemoRequest {
  id: string;
  name: string;
  email: string;
  business_name: string;
  phone: string | null;
  status: string;
  created_at: string;
}

export default function DemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/demo-requests")
      .then((res) => res.json())
      .then((data) => {
        setRequests(data.requests || []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Demo Requests</h1>
      <p className="text-gray-500 mb-8">Leads from the homepage form</p>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>No demo requests yet.</p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.email}</td>
                  <td className="px-4 py-3 text-gray-600">{r.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        r.status === "new"
                          ? "bg-yellow-100 text-yellow-800"
                          : r.status === "contacted"
                          ? "bg-blue-100 text-blue-800"
                          : r.status === "converted"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
