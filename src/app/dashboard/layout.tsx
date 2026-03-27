import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, getCurrentTenant } from "@/lib/supabase-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const tenant = await getCurrentTenant() as { name: string; slug: string } | null;
  if (!tenant) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Med Spa</p>
          <h2 className="font-semibold text-gray-900 truncate">{tenant.name}</h2>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/dashboard" label="📊 Overview" />
          <NavLink href="/dashboard/knowledge-base" label="📚 Knowledge Base" />
          <NavLink href="/dashboard/calls" label="📞 Call Logs" />
          <NavLink href="/dashboard/settings" label="⚙️ Settings" />
        </nav>

        <div className="p-4 border-t border-gray-200">
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full text-left text-sm text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {label}
    </Link>
  );
}
