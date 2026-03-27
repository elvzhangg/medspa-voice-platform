"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await getSupabaseBrowser().auth.signOut();
    router.push("/auth/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full text-left text-sm text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
    >
      Sign out
    </button>
  );
}
