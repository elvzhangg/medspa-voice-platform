import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Image from "next/image";
import { getSession, getCurrentTenant } from "@/lib/supabase-server";
import SignOutButton from "./_components/SignOutButton";
import SidebarNav from "./_components/SidebarNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const tenant = await getCurrentTenant() as { name: string; slug: string } | null;
  if (!tenant) redirect("/onboarding");

  const headerList = await headers();
  const currentUrl = headerList.get("x-url") || "";

  if (!currentUrl.includes(`/${tenant.slug}/dashboard`)) {
    redirect(`/${tenant.slug}/dashboard`);
  }

  const brandPrefix = `/${tenant.slug}`;

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-zinc-200 flex flex-col z-10 shadow-sm">
        {/* Brand header */}
        <div className="px-5 py-5 border-b border-zinc-100">
          <h2 className="font-serif text-lg text-zinc-900 leading-snug truncate">
            {tenant.name}
          </h2>
        </div>

        {/* Navigation */}
        <SidebarNav brandPrefix={brandPrefix} />

        {/* Footer */}
        <div className="px-3 pb-4 pt-2 border-t border-zinc-100 space-y-3">
          <SignOutButton />
          <div className="mx-2 rounded-lg bg-slate-900 px-3 py-2 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">Powered by</span>
            <Image
              src="/vauxvoice-logo.png"
              alt="VauxVoice"
              width={599}
              height={103}
              className="h-3.5 w-auto"
            />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen p-8">{children}</main>
    </div>
  );
}
