import Link from "next/link";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

interface KBDocument {
  id: string;
  title: string;
  category: string;
  created_at: string;
}

export default async function BillingPage() {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return null;

  const { data } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id, title, category, created_at")
    .eq("tenant_id", tenant.id);

  const docs: KBDocument[] = data ?? [];
  const billingDocs = docs.filter(
    (d) =>
      d.category === "billing" ||
      d.category === "policies" ||
      d.title.toLowerCase().includes("billing") ||
      d.title.toLowerCase().includes("financ")
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing Support</h1>
        <p className="text-gray-500 mt-1">
          Manage billing FAQs and payment information for your AI receptionist
        </p>
      </div>

      {/* Info card */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
        <div className="flex gap-4">
          <div className="shrink-0">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-indigo-900 mb-1">How Billing Support Works</h3>
            <p className="text-sm text-indigo-700">
              Billing support is powered by your Knowledge Base. Add billing-related documents —
              pricing, payment plans, CareCredit, Cherry financing — to the{" "}
              <strong>policies or FAQ</strong> category to teach your AI how to handle payment
              questions. When callers ask about billing, the AI will automatically use the{" "}
              <code className="bg-indigo-100 px-1 rounded">create_payment_link</code> tool to
              provide helpful payment information.
            </p>
          </div>
        </div>
      </div>

      {/* Stats + action */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Billing KB Docs</p>
          <p className="text-3xl font-bold text-gray-900">{billingDocs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">AI Tool</p>
          <p className="text-sm font-semibold text-green-600 flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            create_payment_link active
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between">
          <p className="text-sm text-gray-500 mb-3">Manage billing docs</p>
          <Link
            href="/dashboard/knowledge-base"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Billing Docs
          </Link>
        </div>
      </div>

      {/* Billing KB docs table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Billing Knowledge Base Documents</h2>
        {billingDocs.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500 mb-3">No billing documents yet</p>
            <Link
              href="/dashboard/knowledge-base"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Add your first billing doc →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-500 pb-2">Title</th>
                <th className="text-left font-medium text-gray-500 pb-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {billingDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{doc.title}</td>
                  <td className="py-2.5 text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Call tracking — coming soon */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Billing Call Tracking</h2>
          <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Soon you&apos;ll be able to see a log of all calls where billing or payment questions
          were asked, along with what information the AI provided.
        </p>
      </div>
    </div>
  );
}
