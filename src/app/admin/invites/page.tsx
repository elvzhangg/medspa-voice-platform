import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

export default async function AdminInvitesPage() {
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select("id, name, slug, invite_code, phone_number")
    .order("created_at", { ascending: false });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vauxvoice.com";

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Invite Links</h1>
      <p className="text-gray-600 mb-8 text-sm">
        Share these links with customers to let them create accounts linked to their pre-configured tenant.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Invite Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Invite Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants?.map((t) => {
              const inviteLink = `${baseUrl}/auth/signup?invite=${t.invite_code}`;
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <p className="text-gray-500 text-xs">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {t.phone_number?.startsWith("pending") ? (
                      <span className="text-amber-600">Pending</span>
                    ) : (
                      t.phone_number
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{t.invite_code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inviteLink}
                        readOnly
                        className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 w-96 font-mono"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="font-semibold text-blue-900 mb-2">How it works</h2>
        <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
          <li>Admin creates a tenant and does the 48h setup (KB docs, phone number, Vapi config)</li>
          <li>Admin sends the invite link to the customer</li>
          <li>Customer clicks link, creates an account, and is automatically linked to their pre-configured tenant</li>
          <li>Customer sees their dashboard with all the real data (KB docs, calls, etc.)</li>
        </ol>
        <p className="text-xs text-blue-700 mt-3">
          💡 Tip: For self-service signups (no invite), customers still go through normal onboarding and create a new tenant from scratch.
        </p>
      </div>
    </div>
  );
}
