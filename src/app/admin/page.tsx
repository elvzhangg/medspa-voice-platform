"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StatsData {
  totalTenants: number;
  totalDemoRequests: number;
  newDemoRequests: number;
  totalKbDocs: number;
  totalCalls: number;
  recentDemoRequests: RecentDemoRequest[];
  recentTenants: RecentTenant[];
}

interface RecentDemoRequest {
  id: string;
  name: string;
  email: string;
  business_name: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface RecentTenant {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  created_at: string;
}

function StatCard({
  label,
  value,
  highlight,
  sublabel,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  sublabel?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-6 ${
        highlight ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
      }`}
    >
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p
        className={`text-3xl font-bold mt-1 ${
          highlight ? "text-amber-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sublabel && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
    </div>
  );
}

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

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data: StatsData) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load stats");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-gray-400 text-sm">Loading dashboard...</div>
    );
  }

  if (error || !stats) {
    return <div className="text-red-500 text-sm">{error || "Failed to load"}</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">VauxVoice platform overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Tenants" value={stats.totalTenants} />
        <StatCard
          label="Demo Requests"
          value={stats.totalDemoRequests}
          sublabel={
            stats.newDemoRequests > 0
              ? `${stats.newDemoRequests} new`
              : undefined
          }
          highlight={stats.newDemoRequests > 0}
        />
        <StatCard label="KB Documents" value={stats.totalKbDocs} />
        <StatCard label="Total Calls" value={stats.totalCalls} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Demo Requests */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Demo Requests</h2>
            <Link
              href="/admin/demo-requests"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View all
            </Link>
          </div>
          {stats.recentDemoRequests.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No demo requests yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.recentDemoRequests.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.business_name}</p>
                    <p className="text-xs text-gray-500">{r.name} &middot; {r.email}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Tenants */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Tenants</h2>
            <Link
              href="/admin/tenants"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View all
            </Link>
          </div>
          {stats.recentTenants.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No tenants yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.recentTenants.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.slug} &middot; {t.phone_number}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Details
                    </Link>
                    <span className="text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
