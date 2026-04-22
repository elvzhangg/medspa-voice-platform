"use client";

import { useState, useEffect, Suspense } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p>Loading...</p></div>}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteTenant, setInviteTenant] = useState<{ name: string } | null>(null);

  // Check if invite code is valid on mount
  useEffect(() => {
    if (inviteCode) {
      fetch(`/api/invites/validate?code=${inviteCode}`)
        .then(r => r.json())
        .then(data => {
          if (data.valid) {
            setInviteTenant({ name: data.tenant_name });
          } else {
            setError("Invalid or expired invite code");
          }
        })
        .catch(() => setError("Failed to validate invite code"));
    }
  }, [inviteCode]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = getSupabaseBrowser();
    const { data, error: signupError } = await supabase.auth.signUp({ email, password });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("Signup failed - please try again");
      setLoading(false);
      return;
    }

    // If invite code present, link to existing tenant
    if (inviteCode) {
      const linkRes = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode, user_id: data.user.id })
      });

      if (linkRes.ok) {
        router.push("/dashboard");
      } else {
        setError("Failed to link account to tenant");
        setLoading(false);
      }
    } else {
      // No invite code — go to normal onboarding
      router.push("/onboarding");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          {inviteTenant ? (
            <>
              <div className="text-4xl mb-3">✨</div>
              <h1 className="text-2xl font-bold text-gray-900">Join {inviteTenant.name}</h1>
              <p className="text-gray-500 mt-1 text-sm">Create your account to access the dashboard</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
              <p className="text-gray-500 mt-1 text-sm">Get started with your AI Clientele Specialist</p>
            </>
          )}
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Minimum 6 characters"
              minLength={6}
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : inviteTenant ? `Join ${inviteTenant.name}` : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <Link href={inviteCode ? `/auth/login?invite=${inviteCode}` : "/auth/login"} className="text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
