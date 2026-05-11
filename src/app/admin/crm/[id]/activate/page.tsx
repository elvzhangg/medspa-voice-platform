"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";

interface ChatTurn { role: "user" | "assistant"; content: string; at: string }

interface TenantDraft { name: string; slug: string; greeting_message: string; voice_id: string }
interface NumberDraft {
  area_code: string | null;
  status: "pending" | "provisioned" | "failed";
  phone_number?: string | null;
  vapi_phone_number_id?: string | null;
  last_error?: string | null;
}
interface KbChunk { title: string; content: string; category: "services" | "pricing" | "policies" | "faq" | "general" }
interface KnowledgeDraft { chunks: KbChunk[]; warnings?: string[] }
interface EmailDraft { subject: string; body: string }

interface StepState<T> {
  draft: T | null;
  chat: ChatTurn[];
  committed_at?: string | null;
  chunks_inserted?: number;
  sent_at?: string | null;
  sent_to?: string | null;
}

interface ActivationState {
  tenant?: StepState<TenantDraft>;
  number?: StepState<NumberDraft>;
  knowledge?: StepState<KnowledgeDraft>;
  email?: StepState<EmailDraft>;
}

interface Prospect {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  owner_name: string | null;
  owner_email: string | null;
  email: string | null;
  tenant_id: string | null;
  activation_state: ActivationState;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
}

export default function ActivatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/crm/${id}/activate`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setProspect(data.prospect);
    setTenant(data.tenant ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (error || !prospect) return <p className="text-sm text-red-500">{error ?? "Not found"}</p>;

  const stepBase = `/api/admin/crm/${id}/activate`;
  const state = prospect.activation_state ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/admin/crm" className="hover:text-gray-600">CRM</Link>
          <span>›</span>
          <Link href={`/admin/crm/${id}`} className="hover:text-gray-600">{prospect.business_name}</Link>
          <span>›</span>
          <span className="text-gray-600">Activate</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Activate {prospect.business_name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Step the prospect through tenant setup, phone number, knowledge base, and outreach. Each step has a chat — push back if anything looks off.
        </p>
      </div>

      <TenantStep
        endpoint={`${stepBase}/tenant`}
        step={state.tenant}
        prospectName={prospect.business_name}
        tenantId={prospect.tenant_id}
        onChange={load}
      />

      <NumberStep
        endpoint={`${stepBase}/number`}
        step={state.number}
        tenantReady={!!prospect.tenant_id}
        prospectPhone={prospect.phone}
        currentTenantPhone={tenant?.phone_number ?? null}
        onChange={load}
      />

      <KnowledgeStep
        endpoint={`${stepBase}/knowledge`}
        step={state.knowledge}
        tenantReady={!!prospect.tenant_id}
        onChange={load}
      />

      <EmailStep
        endpoint={`${stepBase}/email`}
        step={state.email}
        recipient={prospect.owner_email ?? prospect.email}
        ownerName={prospect.owner_name}
        demoNumberReady={state.number?.draft?.status === "provisioned"}
        onChange={load}
      />
    </div>
  );
}

/* ─────── Step components ─────── */

type StepStatus = "idle" | "ready" | "done" | "warn";

function StepShell({
  num, title, status, children,
}: { num: number; title: string; status: StepStatus; children: React.ReactNode }) {
  const colors: Record<StepStatus, string> = {
    idle: "border-gray-200",
    ready: "border-indigo-300",
    done: "border-emerald-300",
    warn: "border-amber-300",
  };
  const badge: Record<StepStatus, string> = {
    idle: "bg-gray-100 text-gray-500",
    ready: "bg-indigo-50 text-indigo-700",
    done: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
  };
  const label: Record<StepStatus, string> = {
    idle: "not started", ready: "ready to commit", done: "committed", warn: "needs attention",
  };
  return (
    <section className={`bg-white rounded-xl border-2 ${colors[status]} p-5`}>
      <header className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">{num}</span>
          {title}
        </h2>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${badge[status]}`}>{label[status]}</span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ChatBox({
  history, busy, onTurn, placeholder,
}: {
  history: ChatTurn[];
  busy: boolean;
  onTurn: (message: string) => Promise<void>;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(history.length > 0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history.length]);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    await onTurn(msg);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
      >
        💬 Chat to revise
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <div ref={scrollRef} className="max-h-60 overflow-y-auto px-3 py-2 space-y-2 bg-white">
        {history.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No turns yet. Ask the agent to change something.</p>
        ) : (
          history.map((t, i) => (
            <div key={i} className={`text-xs ${t.role === "user" ? "text-gray-900" : "text-indigo-700"}`}>
              <span className="font-semibold mr-2">{t.role === "user" ? "You" : "Agent"}:</span>
              <span className="whitespace-pre-wrap">{t.content}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2 px-2 py-2 border-t border-gray-200">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={placeholder ?? "Tell the agent what to change…"}
          disabled={busy}
          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
      <button onClick={() => setOpen(false)} className="text-[10px] text-gray-400 hover:text-gray-600 px-3 pb-2">collapse</button>
    </div>
  );
}

function useStepActions(endpoint: string, onChange: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function call(body: Record<string, unknown>): Promise<unknown> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Request failed");
      }
      onChange();
      return data;
    } finally {
      setBusy(false);
    }
  }
  return { busy, err, call };
}

/* ─── 1. Tenant ─── */
function TenantStep({
  endpoint, step, prospectName, tenantId, onChange,
}: {
  endpoint: string;
  step?: StepState<TenantDraft>;
  prospectName: string;
  tenantId: string | null;
  onChange: () => void;
}) {
  const { busy, err, call } = useStepActions(endpoint, onChange);
  const draft = step?.draft;
  const status: StepStatus = tenantId ? "done" : draft ? "ready" : "idle";

  useEffect(() => {
    if (!step?.draft && !tenantId) call({ action: "draft" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StepShell num={1} title="Tenant" status={status}>
      {!draft && !tenantId && <p className="text-xs text-gray-400">Loading draft…</p>}
      {draft && (
        <div className="space-y-2 text-sm">
          <Field label="Name" value={draft.name} />
          <Field label="Slug" value={draft.slug} mono />
          <Field label="Greeting" value={draft.greeting_message} multiline />
          <Field label="Voice ID" value={draft.voice_id} mono small />
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2 pt-1">
        {tenantId ? (
          <span className="text-xs text-emerald-700 font-medium">✓ Tenant created ({tenantId.slice(0, 8)}…)</span>
        ) : (
          <button
            onClick={() => call({ action: "commit" })}
            disabled={busy || !draft}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create tenant"}
          </button>
        )}
      </div>
      {!tenantId && (
        <ChatBox
          history={step?.chat ?? []}
          busy={busy}
          placeholder={`e.g. "use slug ${prospectName.toLowerCase().split(/\s+/)[0]}-spa"`}
          onTurn={async (message) => { await call({ action: "chat", message }); }}
        />
      )}
    </StepShell>
  );
}

/* ─── 2. Number ─── */
function NumberStep({
  endpoint, step, tenantReady, prospectPhone, currentTenantPhone, onChange,
}: {
  endpoint: string;
  step?: StepState<NumberDraft>;
  tenantReady: boolean;
  prospectPhone: string | null;
  currentTenantPhone: string | null;
  onChange: () => void;
}) {
  const { busy, err, call } = useStepActions(endpoint, onChange);
  const draft = step?.draft;
  const status: StepStatus =
    draft?.status === "provisioned" ? "done"
    : draft?.status === "failed" ? "warn"
    : tenantReady && draft ? "ready"
    : "idle";

  useEffect(() => {
    if (tenantReady && !step?.draft) call({ action: "draft" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantReady]);

  return (
    <StepShell num={2} title="Vapi phone number" status={status}>
      {!tenantReady && <p className="text-xs text-amber-600">Activate the tenant first.</p>}
      {tenantReady && !draft && <p className="text-xs text-gray-400">Loading draft…</p>}
      {draft && (
        <div className="space-y-1.5 text-sm">
          <Field label="Preferred area code" value={draft.area_code ?? "(any)"} mono />
          {prospectPhone && draft.area_code && (
            <p className="text-[10px] text-gray-400">Derived from prospect phone {prospectPhone}.</p>
          )}
          {draft.status === "provisioned" && draft.phone_number && (
            <p className="text-sm font-mono text-emerald-700">✓ {draft.phone_number}</p>
          )}
          {draft.status === "failed" && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
              <p className="font-semibold text-amber-800 mb-0.5">Number pending</p>
              <p className="text-amber-700">{draft.last_error}</p>
              <p className="text-amber-600 mt-1">You can keep going with knowledge + email; come back and click Retry.</p>
            </div>
          )}
          {currentTenantPhone && currentTenantPhone !== draft.phone_number && (
            <p className="text-[10px] text-gray-400">Tenant currently linked to {currentTenantPhone}.</p>
          )}
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2 pt-1">
        {draft?.status === "provisioned" ? (
          <span className="text-xs text-emerald-700 font-medium">✓ Provisioned</span>
        ) : (
          <button
            onClick={() => call({ action: "commit" })}
            disabled={busy || !draft || !tenantReady}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? "Buying…" : draft?.status === "failed" ? "Retry" : "Provision number"}
          </button>
        )}
      </div>
      {tenantReady && draft?.status !== "provisioned" && (
        <ChatBox
          history={step?.chat ?? []}
          busy={busy}
          placeholder='e.g. "try 415" or "go LA local"'
          onTurn={async (message) => { await call({ action: "chat", message }); }}
        />
      )}
    </StepShell>
  );
}

/* ─── 3. Knowledge ─── */
function KnowledgeStep({
  endpoint, step, tenantReady, onChange,
}: {
  endpoint: string;
  step?: StepState<KnowledgeDraft>;
  tenantReady: boolean;
  onChange: () => void;
}) {
  const { busy, err, call } = useStepActions(endpoint, onChange);
  const [showAll, setShowAll] = useState(false);
  const draft = step?.draft;
  const committed = !!step?.committed_at;
  const status: StepStatus =
    committed ? "done"
    : draft && (draft.warnings?.length ?? 0) > 0 ? "warn"
    : draft ? "ready"
    : "idle";

  useEffect(() => {
    if (tenantReady && !step?.draft) call({ action: "draft" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantReady]);

  const chunks = draft?.chunks ?? [];
  const visible = showAll ? chunks : chunks.slice(0, 4);

  const byCategory: Record<string, number> = {};
  for (const c of chunks) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;

  return (
    <StepShell num={3} title="Knowledge base" status={status}>
      {!tenantReady && <p className="text-xs text-amber-600">Activate the tenant first.</p>}
      {tenantReady && !draft && <p className="text-xs text-gray-400">Loading chunks…</p>}
      {draft && (
        <>
          <div className="text-sm">
            <p>
              <span className="font-semibold">{chunks.length}</span> chunks ·{" "}
              {Object.entries(byCategory).map(([k, v]) => `${v} ${k}`).join(", ")}
            </p>
          </div>
          {(draft.warnings?.length ?? 0) > 0 && (
            <ul className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700 list-disc list-inside space-y-0.5">
              {draft.warnings!.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {chunks.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {visible.map((c, i) => (
                <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-gray-800">{c.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{c.category}</span>
                  </div>
                  <p className="text-gray-600 whitespace-pre-wrap line-clamp-3">{c.content}</p>
                </div>
              ))}
              {chunks.length > 4 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full text-xs text-indigo-600 hover:text-indigo-700 py-1.5 bg-gray-50"
                >
                  {showAll ? "Show fewer" : `Show all ${chunks.length} chunks`}
                </button>
              )}
            </div>
          )}
          {committed && (
            <p className="text-xs text-emerald-700 font-medium">
              ✓ Embedded {step?.chunks_inserted ?? 0} chunks at {new Date(step!.committed_at!).toLocaleString()}
            </p>
          )}
        </>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => call({ action: "commit" })}
          disabled={busy || !draft || !tenantReady}
          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy ? "Embedding…" : committed ? "Re-embed (replaces existing)" : "Embed and save"}
        </button>
        {draft && (
          <button
            onClick={() => call({ action: "rebuild" })}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
            title="Rebuild from prospect fields, discarding chat edits"
          >
            Rebuild from prospect
          </button>
        )}
      </div>
      {tenantReady && (
        <ChatBox
          history={step?.chat ?? []}
          busy={busy}
          placeholder='e.g. "add HydraFacial $200" or "remove the deposit chunk"'
          onTurn={async (message) => { await call({ action: "chat", message }); }}
        />
      )}
    </StepShell>
  );
}

/* ─── 4. Email ─── */
function EmailStep({
  endpoint, step, recipient, ownerName, demoNumberReady, onChange,
}: {
  endpoint: string;
  step?: StepState<EmailDraft>;
  recipient: string | null;
  ownerName: string | null;
  demoNumberReady: boolean;
  onChange: () => void;
}) {
  const { busy, err, call } = useStepActions(endpoint, onChange);
  const draft = step?.draft;
  const sent = !!step?.sent_at;
  const status: StepStatus =
    sent ? "done"
    : !demoNumberReady ? "warn"
    : draft ? "ready"
    : "idle";

  useEffect(() => {
    if (!step?.draft) call({ action: "draft" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StepShell num={4} title="Owner outreach email" status={status}>
      {!demoNumberReady && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Number not yet provisioned — the draft will skip the call CTA. You can re-draft once the number is ready.
        </p>
      )}
      <div className="text-xs text-gray-500">
        To: <span className="font-mono text-gray-800">{recipient ?? "(no email on prospect)"}</span>
        {ownerName && <span className="text-gray-400"> · {ownerName}</span>}
      </div>
      {!draft && <p className="text-xs text-gray-400">Drafting…</p>}
      {draft && (
        <div className="space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Subject</p>
            <p className="text-sm text-gray-800">{draft.subject}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Body</p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded p-3">{draft.body}</pre>
          </div>
        </div>
      )}
      {sent && (
        <p className="text-xs text-emerald-700 font-medium">
          ✓ Sent to {step?.sent_to} at {new Date(step!.sent_at!).toLocaleString()}
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2 pt-1">
        {!sent && (
          <>
            <button
              onClick={() => call({ action: "send" })}
              disabled={busy || !draft || !recipient}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send email"}
            </button>
            <button
              onClick={() => call({ action: "regenerate" })}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
              title="Regenerate from scratch, discarding chat edits"
            >
              Regenerate
            </button>
          </>
        )}
      </div>
      {!sent && (
        <ChatBox
          history={step?.chat ?? []}
          busy={busy}
          placeholder='e.g. "more casual" or "lead with the Botox menu"'
          onTurn={async (message) => { await call({ action: "chat", message }); }}
        />
      )}
    </StepShell>
  );
}

/* ─── small display helpers ─── */
function Field({ label, value, mono = false, multiline = false, small = false }: {
  label: string; value: string; mono?: boolean; multiline?: boolean; small?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {multiline ? (
        <p className={`text-gray-800 whitespace-pre-wrap ${small ? "text-xs" : "text-sm"}`}>{value}</p>
      ) : (
        <p className={`text-gray-800 ${mono ? "font-mono" : ""} ${small ? "text-xs" : "text-sm"}`}>{value}</p>
      )}
    </div>
  );
}
