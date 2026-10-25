import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, LiveDot, Modal, PageHeader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { isClosedStatus, TicketsApi, toTicket } from "../firebase/tickets";
import { shortId, timeAgo } from "../lib/format";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_TONES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONES,
} from "../lib/labels";
import { useLiveQuery } from "../lib/useLive";
import type { Priority } from "../types";

type Scope = "open" | "mine" | "unassigned" | "closed" | "all";

export default function HelpDesk() {
  const profile = useProfile();
  const { clientName, clients } = useDirectory();
  const isStaff = profile.role !== "client";
  const [params, setParams] = useSearchParams();
  const { data, loading, error } = useLiveQuery(TicketsApi.visibleQuery(profile), toTicket, `tickets:${profile.id}:${profile.role}`);

  const [scope, setScope] = useState<Scope>("open");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");

  const scopes: [Scope, string][] = isStaff
    ? [["open", "Open"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["closed", "Resolved & closed"], ["all", "All"]]
    : [["open", "Open"], ["closed", "Resolved & closed"], ["all", "All"]];

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((t) => {
        const closed = isClosedStatus(t.status);
        switch (scope) {
          case "open": return !closed;
          case "mine": return !closed && t.assignee_id === profile.id;
          case "unassigned": return !closed && !t.assignee_id;
          case "closed": return closed;
          default: return true;
        }
      })
      .filter((t) => !clientFilter || t.client_id === clientFilter)
      .filter((t) => !q || t.subject.toLowerCase().includes(q) || shortId(t.id).toLowerCase().includes(q) || t.requester_name.toLowerCase().includes(q))
      .sort((a, b) =>
        scope === "closed" || scope === "all"
          ? b.updated_at.getTime() - a.updated_at.getTime()
          : PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at.getTime() - b.created_at.getTime(),
      );
  }, [data, scope, clientFilter, search, profile.id]);

  const closeNew = () => {
    params.delete("new");
    setParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Help Desk"
        subtitle={<span className="flex items-center gap-2">{isStaff ? "Requests from every client." : "Your requests to Tauri support."} <LiveDot /></span>}
        actions={
          <button className={buttonClass.primary} onClick={() => setParams({ new: "1" })}>
            New request
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {scopes.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${scope === value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <input className={inputClass} placeholder="Search subject, #id or requester…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isStaff && (
          <select className={inputClass} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <Card>
        <ErrorNote error={error} />
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-slate-100" />
        ) : tickets.length === 0 ? (
          <Empty>No tickets here.</Empty>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link to={`/helpdesk/${t.id}`} className="-mx-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      <span className="font-mono text-xs text-slate-400">#{shortId(t.id)}</span> {t.subject}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isStaff && `${clientName(t.client_id)} · `}
                      {t.requester_name} · opened {timeAgo(t.created_at)} · {t.assignee_name ? `with ${t.assignee_name}` : "unassigned"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge tone={PRIORITY_TONES[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                    <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {params.get("new") && <NewTicket onClose={closeNew} />}
    </div>
  );
}

function NewTicket({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const { clients } = useDirectory();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState(profile.client_id ?? "");
  const [priority, setPriority] = useState<Priority>("normal");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await TicketsApi.create({ subject, description, client_id: clientId, priority }, profile);
      navigate(`/helpdesk/${id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="New help desk request" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="What do you need help with?">
          <input className={inputClass} required value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus placeholder="e.g. Can't connect to the VPN" />
        </Field>
        <Field label="Details" hint="What happened, when it started, who's affected, any error messages.">
          <textarea className={inputClass} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {profile.role !== "client" && (
            <Field label="Client">
              <select className={inputClass} required value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose…</option>
                {clients.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Priority">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>Submit request</button>
        </div>
      </form>
    </Modal>
  );
}
