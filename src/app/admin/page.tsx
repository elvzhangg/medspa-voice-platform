"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  created_at: string;
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tenants")
      .then((res) => res.json())
      .then((data) => {
        setTenants(data.tenants || []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tenants</h1>
          <p className="text-gray-500 mt-1">Med spas currently on the platform</p>
        </div>
        <Link
          href="/admin/onboard"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          + Onboard New
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏢</p>
          <p>No tenants yet. Onboard your first med spa above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600">{t.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{t.phone_number}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(t.created_at).toLocaleDateString()}
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
