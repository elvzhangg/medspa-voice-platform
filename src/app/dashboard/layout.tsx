import { redirect } from"next/navigation";
import { headers } from"next/headers";
import { getSession, getCurrentTenant } from"@/lib/supabase-server";
import SignOutButton from"./_components/SignOutButton";
import SidebarNav from"./_components/SidebarNav";

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
 const currentUrl = headerList.get("x-url") ||"";

 if (!currentUrl.includes(`/${tenant.slug}/dashboard`)) {
 redirect(`/${tenant.slug}/dashboard`);
 }

 const brandPrefix = `/${tenant.slug}`;

 return (
 <div className="min-h-screen bg-gray-50 flex">
 {/* Sidebar */}
 <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
 {/* Brand header */}
 <div className="px-5 py-5 border-b border-gray-100">
 <div className="flex items-center gap-1.5 mb-2">
 <span className="block w-1.5 h-1.5 rounded-full bg-amber-50 border border-amber-300" />
 <span className="text-[10px] font-semibold text-amber-600">
 AI Receptionist
 </span>
 </div>
 <h2 className="font-bold text-gray-900 text-base leading-snug truncate">
 {tenant.name}
 </h2>
 </div>

 {/* Navigation */}
 <SidebarNav brandPrefix={brandPrefix} />

 {/* Footer */}
 <div className="px-3 pb-4 pt-2 border-t border-gray-100">
 <SignOutButton />
 </div>
 </aside>

 {/* Main content */}
 <main className="ml-64 flex-1 min-h-screen p-8">{children}</main>
 </div>
 );
}
