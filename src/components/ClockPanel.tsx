import { useEffect, useMemo, useState } from "react";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { TasksApi, toTask } from "../firebase/tasks";
import { isClosedStatus, TicketsApi, toTicket } from "../firebase/tickets";
import { entryDuration, TimeApi } from "../firebase/time";
import { formatClock, formatDateTime, shortId } from "../lib/format";
import { useActiveEntry } from "../lib/useActiveEntry";
import { useLiveQuery, useNow } from "../lib/useLive";
import { buttonClass, ErrorNote, Field, inputClass, LiveDot } from "./ui";

/** Clock in (choosing the client and, optionally, the ticket or task) and clock out. */
export default function ClockPanel() {
  const profile = useProfile();
  const { clients } = useDirectory();
  const { data: entry, loading } = useActiveEntry();
  const now = useNow();

  const [clientId, setClientId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const tickets = useLiveQuery(TicketsApi.visibleQuery(profile), toTicket, `clock-tickets:${profile.id}`);
  const tasks = useLiveQuery(TasksApi.visibleQuery(profile), toTask, `clock-tasks:${profile.id}`);
  const activeClients = clients.filter((c) => c.active);

  const openTickets = useMemo(
    () => tickets.data.filter((t) => t.client_id === clientId && !isClosedStatus(t.status)),
    [tickets.data, clientId],
  );
  const openTasks = useMemo(
    () => tasks.data.filter((t) => t.client_id === clientId && t.status !== "done"),
    [tasks.data, clientId],
  );

  // While on the clock, the notes box edits the open entry's notes.
  useEffect(() => {
    setNotes(entry?.notes ?? "");
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function clockIn() {
    const client = activeClients.find((c) => c.id === clientId);
    if (!client) return setError(new Error("Choose the client you're working for"));
    run(async () => {
      await TimeApi.clockIn(profile, { client, ticket_id: ticketId || null, task_id: taskId || null, notes });
      setTicketId("");
      setTaskId("");
    });
  }

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;

  if (entry) {
    const ticket = tickets.data.find((t) => t.id === entry.ticket_id);
    const task = tasks.data.find((t) => t.id === entry.task_id);
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">On the clock</p>
          <LiveDot label="Visible to Tauri and the client" />
        </div>
        <p className="mt-3 text-5xl font-semibold tabular-nums text-slate-900">{formatClock(entryDuration(entry, now))}</p>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{entry.client_name}</span> · since {formatDateTime(entry.clock_in)}
        </p>
        {ticket && <p className="mt-1 text-sm text-slate-500">Ticket #{shortId(ticket.id)}: {ticket.subject}</p>}
        {task && <p className="mt-1 text-sm text-slate-500">Task: {task.title}</p>}

        <div className="mt-5">
          <Field label="What are you working on?" hint="Saved when you click away. Clients see these notes.">
            <textarea
              className={inputClass}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== entry.notes && run(() => TimeApi.updateNotes(entry.id, notes))}
            />
          </Field>
        </div>
        <div className="mt-4 space-y-3">
          <ErrorNote error={error} />
          <button disabled={busy} onClick={() => run(() => TimeApi.clockOut(profile, notes))} className={`${buttonClass.danger} w-full py-3 text-base`}>
            Clock out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Off the clock</p>
      <p className="mt-3 text-5xl font-semibold tabular-nums text-slate-300">0:00:00</p>
      <div className="mt-5 space-y-4">
        <div>
          <Field label="Client">
            <select className={inputClass} value={clientId} onChange={(e) => { setClientId(e.target.value); setTicketId(""); setTaskId(""); }}>
              <option value="">Choose a client…</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Help desk ticket (optional)">
          <select className={inputClass} value={ticketId} onChange={(e) => setTicketId(e.target.value)} disabled={!clientId}>
            <option value="">None</option>
            {openTickets.map((t) => (
              <option key={t.id} value={t.id}>#{shortId(t.id)} {t.subject}</option>
            ))}
          </select>
        </Field>
        <Field label="Task (optional)">
          <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!clientId}>
            <option value="">None</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </Field>
        <div>
          <Field label="Notes (optional)">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. On site: replacing the firewall" />
          </Field>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <ErrorNote error={error} />
        {activeClients.length === 0 && <p className="text-sm text-slate-500">No active clients yet. An admin adds them on the Clients page.</p>}
        <button disabled={busy || !clientId} onClick={clockIn} className={`${buttonClass.primary} w-full bg-emerald-600 py-3 text-base hover:bg-emerald-700`}>
          Clock in
        </button>
        <p className="text-center text-xs text-slate-400">The time is stamped by the server when you press the button.</p>
      </div>
    </div>
  );
}
