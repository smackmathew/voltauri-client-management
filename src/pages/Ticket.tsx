import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { initials } from "../components/OnTheClock";
import { Badge, buttonClass, Card, ErrorNote, Field, inputClass, LiveDot, PageLoader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { isClosedStatus, TicketsApi, toComment, toTicket } from "../firebase/tickets";
import { entryDuration, TimeApi, toEntry } from "../firebase/time";
import { formatDateTime, formatDuration, shortId, timeAgo } from "../lib/format";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONES,
} from "../lib/labels";
import { useLiveDoc, useLiveQuery } from "../lib/useLive";
import type { Priority, Ticket as TicketType, TicketStatus } from "../types";

export default function Ticket() {
  const { id = "" } = useParams();
  const profile = useProfile();
  const { clientName, staff } = useDirectory();
  const isStaff = profile.role !== "client";
  const ticket = useLiveDoc(TicketsApi.ticketDoc(id), toTicket, `ticket:${id}`);
  const comments = useLiveQuery(TicketsApi.commentsQuery(id, profile), toComment, `comments:${id}:${profile.role}`);
  const [error, setError] = useState<unknown>(null);

  // Time logged against this ticket, within what the viewer can see.
  const since = ticket.data?.created_at ?? new Date();
  const time = useLiveQuery(
    ticket.data ? TimeApi.rangeQuery(profile, new Date(since.getTime() - 60_000), new Date(Date.now() + 86_400_000)) : null,
    toEntry,
    `ticket-time:${id}:${ticket.data ? "y" : "n"}`,
  );
  const ticketTime = time.data.filter((e) => e.ticket_id === id);
  const logged = ticketTime.reduce((sum, e) => sum + entryDuration(e), 0);

  const thread = useMemo(() => [...comments.data].sort((a, b) => a.created_at.getTime() - b.created_at.getTime()), [comments.data]);

  if (ticket.loading) return <PageLoader />;
  if (!ticket.data) {
    return (
      <Card>
        <p className="text-sm text-slate-500">This ticket doesn't exist or you don't have access to it.</p>
        <Link to="/helpdesk" className={buttonClass.link}>Back to the help desk</Link>
      </Card>
    );
  }
  const t = ticket.data;
  const change = (changes: Parameters<typeof TicketsApi.update>[1]) => TicketsApi.update(t, changes).catch(setError);

  return (
    <div>
      <Link to="/helpdesk" className="text-sm text-slate-500 hover:text-slate-700">← Help Desk</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            <span className="font-mono text-lg text-slate-400">#{shortId(t.id)}</span> {t.subject}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {clientName(t.client_id)} · opened by {t.requester_name} {timeAgo(t.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveDot />
          <Badge tone={PRIORITY_TONES[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
          <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{t.description || <span className="text-slate-400">No details given.</span>}</p>
          </Card>
          <div className="space-y-3">
            {thread.map((c) => (
              <div key={c.id} className={`flex gap-3 rounded-xl border p-4 ${c.internal ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{initials(c.author_name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-slate-800">{c.author_name}</span>{" "}
                    <span className="text-xs text-slate-400">{formatDateTime(c.created_at)}</span>{" "}
                    {c.internal && <Badge tone="amber">Internal note</Badge>}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Reply ticket={t} />
        </div>

        <div className="space-y-4">
          <ErrorNote error={error} />
          {isStaff ? (
            <Card title="Details">
              <div className="space-y-3">
                <Field label="Status">
                  <select className={inputClass} value={t.status} onChange={(e) => change({ status: e.target.value as TicketStatus })}>
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Assigned to">
                  <select
                    className={inputClass}
                    value={t.assignee_id ?? ""}
                    onChange={(e) => {
                      const p = staff.find((s) => s.id === e.target.value);
                      change({ assignee: p ? { id: p.id, name: p.full_name } : null });
                    }}
                  >
                    <option value="">Unassigned</option>
                    {t.assignee_id && !staff.some((s) => s.id === t.assignee_id) && <option value={t.assignee_id}>{t.assignee_name}</option>}
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </Field>
                {!t.assignee_id && (
                  <button className={`${buttonClass.secondary} w-full`} onClick={() => change({ assignee: { id: profile.id, name: profile.full_name }, status: t.status === "open" ? "in_progress" : t.status })}>
                    Take this ticket
                  </button>
                )}
                <Field label="Priority">
                  <select className={inputClass} value={t.priority} onChange={(e) => change({ priority: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </Card>
          ) : (
            <Card title="Details">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Assigned to</dt><dd className="text-slate-800">{t.assignee_name ?? "Not yet"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Last update</dt><dd className="text-slate-800">{timeAgo(t.updated_at)}</dd></div>
              </dl>
              <div className="mt-4">
                {isClosedStatus(t.status) ? (
                  <button className={`${buttonClass.secondary} w-full`} onClick={() => change({ status: "open" })}>Reopen request</button>
                ) : (
                  <button className={`${buttonClass.secondary} w-full`} onClick={() => change({ status: "closed" })}>Close request — it's fixed</button>
                )}
              </div>
            </Card>
          )}
          <Card title="Time on this ticket">
            <p className="text-2xl font-semibold text-slate-900">{formatDuration(logged)}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {ticketTime.map((e) => (
                <li key={e.id}>
                  {e.tech_name} · {formatDateTime(e.clock_in)} · {e.clock_out ? formatDuration(entryDuration(e)) : <span className="text-emerald-600">working now</span>}
                </li>
              ))}
            </ul>
            {profile.role === "tech" && <p className="mt-2 text-xs text-slate-400">Shows your own time only.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Reply({ ticket }: { ticket: TicketType }) {
  const profile = useProfile();
  const isStaff = profile.role !== "client";
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const sent = body;
    try {
      await TicketsApi.addComment(ticket.id, profile, sent, internal);
      // A client replying to a ticket that's waiting on them puts it back in the queue.
      if (!isStaff && ticket.status === "waiting") await TicketsApi.update(ticket, { status: "open" }).catch(() => {});
      // Keep anything typed while this was sending.
      setBody((current) => (current === sent ? "" : current));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
      <textarea
        className={inputClass}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isStaff ? (internal ? "Internal note — only Tauri staff see this" : "Reply to the client…") : "Add a reply…"}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {isStaff ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal note (hidden from the client)
          </label>
        ) : <span />}
        <button type="submit" className={buttonClass.primary} disabled={busy || !body.trim()}>
          {internal ? "Add note" : "Send reply"}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}
