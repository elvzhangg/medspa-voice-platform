"use client";

import { useEffect, useState } from "react";

interface Campaign {
  id: string;
  name: string;
  type: string;
  channel: string;
  status: string;
  message: string;
  subject: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  total_contacts: number;
  sent_count: number;
  created_at: string;
  updated_at: string;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  reminder:     { label: "Appointment Reminder", className: "bg-blue-100 text-blue-700" },
  reactivation: { label: "Patient Reactivation",  className: "bg-amber-100 text-amber-700" },
  promotion:    { label: "Promotion",              className: "bg-violet-100 text-violet-700" },
};

const CHANNEL_STYLES: Record<string, { label: string; className: string }> = {
  sms:   { label: "SMS",   className: "bg-green-100 text-green-700" },
  email: { label: "Email", className: "bg-indigo-100 text-indigo-700" },
  both:  { label: "Both",  className: "bg-purple-100 text-purple-700" },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-gray-100 text-gray-600" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700" },
  sent:      { label: "Sent",      className: "bg-green-100 text-green-700" },
  paused:    { label: "Paused",    className: "bg-yellow-100 text-yellow-700" },
};

const EMPTY_FORM = {
  name: "",
  type: "reminder",
  channel: "sms",
  subject: "",
  message: "",
  scheduled_at: "",
  contacts: "",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchCampaigns = async () => {
    setError(null);
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      setError("Failed to load campaigns. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const stats = {
    total:         campaigns.length,
    scheduled:     campaigns.filter((c) => c.status === "scheduled").length,
    sent:          campaigns.filter((c) => c.status === "sent").length,
    totalContacts: campaigns.reduce((sum, c) => sum + (c.total_contacts || 0), 0),
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      channel: c.channel,
      subject: c.subject || "",
      message: c.message,
      scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16) : "",
      contacts: "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!form.name.trim() || !form.message.trim()) {
      setFormError("Name and message are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        ...form,
        scheduled_at: !asDraft && form.scheduled_at ? form.scheduled_at : null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch("/api/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const d = await res.json();
        setFormError(d.error || "Something went wrong.");
        return;
      }

      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      setEditingId(null);
      await fetchCampaigns();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      await fetchCampaigns();
    } catch {
      alert("Failed to delete campaign.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">Send SMS and email campaigns to your patients</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </button>
      </div>

      {/* Coming soon banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6">
        <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-700">
          <span className="font-medium">SMS and email sending is coming soon.</span>{" "}
          You can create and schedule campaigns now — they&apos;ll send automatically when the feature launches.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Campaigns", value: stats.total,         color: "text-gray-900" },
          { label: "Scheduled",       value: stats.scheduled,     color: "text-blue-600" },
          { label: "Sent",            value: stats.sent,          color: "text-green-600" },
          { label: "Total Contacts",  value: stats.totalContacts, color: "text-indigo-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{loading ? "—" : s.value}</p>
          </div>
        ))}
      </div>

      {/* New / Edit Campaign form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">{editingId ? "Edit Campaign" : "New Campaign"}</h2>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Spring Botox Promo"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Type + Channel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="reminder">Appointment Reminder</option>
                  <option value="reactivation">Patient Reactivation</option>
                  <option value="promotion">Promotion</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>

            {/* Subject — only for email / both */}
            {(form.channel === "email" || form.channel === "both") && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Exclusive offer just for you"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Message */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
                placeholder="Hi {name}, just a reminder about your appointment on {date}..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Schedule <span className="text-gray-400 font-normal">(optional — leave blank to save as draft)</span>
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Contacts */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Contacts <span className="text-gray-400 font-normal">(one per line — &quot;Name, phone/email&quot; or just phone/email)</span>
              </label>
              <textarea
                value={form.contacts}
                onChange={(e) => setForm({ ...form, contacts: e.target.value })}
                rows={5}
                placeholder={`Sarah Johnson, +15550001234\nAlex Smith, alex@email.com\n+15550005678`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save as Draft"}
            </button>
            {form.scheduled_at && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="bg-white border border-indigo-600 text-indigo-600 text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Schedule"}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-sm text-gray-600 px-5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Campaign table / empty state */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">All Campaigns</h2>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">Loading campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-14">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <p className="text-sm font-medium text-gray-600 mb-1">No campaigns yet</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mb-5">
              Create your first campaign to start reaching out to patients with appointment reminders, reactivation messages, or promotions.
            </p>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create your first campaign
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Name</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Type</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Channel</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Status</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Contacts</th>
                  <th className="text-left font-medium text-gray-500 pb-3 pr-4">Created</th>
                  <th className="text-left font-medium text-gray-500 pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.map((c) => {
                  const typeStyle    = TYPE_STYLES[c.type]    ?? { label: c.type,    className: "bg-gray-100 text-gray-600" };
                  const channelStyle = CHANNEL_STYLES[c.channel] ?? { label: c.channel, className: "bg-gray-100 text-gray-600" };
                  const statusStyle  = STATUS_STYLES[c.status]  ?? { label: c.status,  className: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.scheduled_at && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(c.scheduled_at).toLocaleString()}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeStyle.className}`}>
                          {typeStyle.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${channelStyle.className}`}>
                          {channelStyle.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.className}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {c.total_contacts > 0 ? (
                          <span>
                            {c.sent_count > 0
                              ? `${c.sent_count}/${c.total_contacts}`
                              : c.total_contacts}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEdit(c)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
