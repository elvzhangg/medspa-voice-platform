"use client";

import { getSupabaseBrowser } from"@/lib/supabase-browser";
import { useRouter } from"next/navigation";

export default function SignOutButton() {
 const router = useRouter();

 async function handleSignOut() {
 await getSupabaseBrowser().auth.signOut();
 router.push("/auth/login");
 }

 return (
 <button
 onClick={handleSignOut}
 className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 hover:bg-[#fdf9ec] transition-colors"
 >
 <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
 </svg>
 Sign out
 </button>
 );
}
