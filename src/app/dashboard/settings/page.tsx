import { getCurrentTenant } from "@/lib/supabase-server";

export default async function SettingsPage() {
  const tenant = await getCurrentTenant() as {
    id: string; name: string; phone_number: string;
    voice_id: string; greeting_message: string;
  } | null;
  if (!tenant) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-gray-500 mb-8">Configure your AI receptionist</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 max-w-2xl">
        <Field label="Business Name" value={tenant.name} />
        <Field label="Phone Number" value={tenant.phone_number} hint="Contact support to change your number" />
        <Field label="Voice" value={tenant.voice_id} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Greeting Message</label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
            {tenant.greeting_message}
          </div>
          <p className="text-xs text-gray-400 mt-1">The first thing your AI says when a call starts</p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Need to update settings?{" "}
            <a href="mailto:support@example.com" className="text-indigo-600 hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
        {value}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
