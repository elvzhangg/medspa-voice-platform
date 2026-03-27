"use client";

import { useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_PASSWORD = "medspa2026"; // Simple password protection for internal use

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_authed");
    if (stored === "true") setAuthed(true);
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_authed", "true");
      setAuthed(true);
    } else {
      alert("Incorrect password");
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl border border-gray-200 w-full max-w-sm">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Admin Access</h1>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter admin password"
            className="w-full px-4 py-2 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold text-gray-900">
              🛠️ Admin
            </Link>
            <NavLink href="/admin" current={pathname === "/admin"}>
              Tenants
            </NavLink>
            <NavLink href="/admin/onboard" current={pathname === "/admin/onboard"}>
              + Onboard
            </NavLink>
            <NavLink href="/admin/demo-requests" current={pathname === "/admin/demo-requests"}>
              Demo Requests
            </NavLink>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem("admin_authed");
              setAuthed(false);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm ${current ? "text-indigo-600 font-medium" : "text-gray-600 hover:text-gray-900"}`}
    >
      {children}
    </Link>
  );
}
