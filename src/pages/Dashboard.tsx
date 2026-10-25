import { Link } from "react-router-dom";
import ClockPanel from "../components/ClockPanel";
import OnTheClock from "../components/OnTheClock";
import { Badge, Card, Empty, PageHeader, StatCard } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { TasksApi, toTask } from "../firebase/tasks";
import { isClosedStatus, TicketsApi, toTicket } from "../firebase/tickets";
import { entryDuration, TimeApi, toEntry } from "../firebase/time";
import { addDays, formatHours, isoDay, shortId, startOfMonth, startOfWeek, timeAgo } from "../lib/format";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_TONES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONES,
} from "../lib/labels";
import { useLiveQuery, useNow } from "../lib/useLive";
import type { Task, Ticket } from "../types";

export default function Dashboard() {
  const profile = useProfile();
  const { clientName, clients } = useDirectory();
  const now = useNow(30_000);
  const today = isoDay(now);
  const key = `${profile.id}:${profile.role}`;

  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const rangeStart = monthStart < weekStart ? monthStart : weekStart;
  const time = useLiveQuery(TimeApi.rangeQuery(profile, rangeStart, addDays(now, 1)), toEntry, `dash-time:${key}:${isoDay(rangeStart)}`);
  const tickets = useLiveQuery(TicketsApi.visibleQuery(profile), toTicket, `dash-tickets:${key}`);
  const tasks = useLiveQuery(TasksApi.visibleQuery(profile), toTask, `dash-tasks:${key}`);

  const hours = (from: Date) =>
    time.data.filter((e) => e.clock_in >= from).reduce((sum, e) => sum + entryDuration(e, now), 0);
  const openTickets = tickets.data.filter((t) => !isClosedStatus(t.status));
  const openTasks = tasks.data.filter((t) => t.status !== "done");
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < today);

  const isClient = profile.role === "client";
  const mineOnly = profile.role === "tech";
  const myTickets = openTickets.filter((t) => !mineOnly || t.assignee_id === profile.id || t.assignee_id === null);
  const myTasks = openTasks.filter((t) => !mineOnly || t.assignee_id === profile.id);

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${profile.full_name.split(" ")[0]}`}
        subtitle={isClient ? `Live view of the work Tauri is doing for ${clients[0]?.name ?? "you"}.` : "Everything happening across Tauri, live."}
        actions={
          <Link to="/helpdesk?new=1" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            New help desk request
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={isClient ? "Hours this week" : mineOnly ? "My hours this week" : "Team hours this week"} value={formatHours(hours(weekStart))} hint="Since Monday" />
        <StatCard label={isClient ? "Hours this month" : mineOnly ? "My hours this month" : "Team hours this month"} value={formatHours(hours(monthStart))} />
        <StatCard label="Open tickets" value={openTickets.length} tone={openTickets.some((t) => t.priority === "urgent") ? "negative" : "default"} hint={`${openTickets.filter((t) => !t.assignee_id).length} unassigned`} />
        <StatCard label="Open tasks" value={openTasks.length} tone={overdue.length ? "warning" : "default"} hint={overdue.length ? `${overdue.length} overdue` : "None overdue"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!isClient && profile.role === "tech" && <ClockPanel />}
          <OnTheClock title={isClient ? "Working for you right now" : "On the clock now"} />
          <TicketList title={mineOnly ? "Tickets for me (and unassigned)" : "Open help desk tickets"} tickets={myTickets} clientName={isClient ? undefined : clientName} />
        </div>
        <div className="space-y-6">
          {profile.role === "admin" && <ClockPanel />}
          <TaskList title={mineOnly ? "My tasks" : "Open tasks"} tasks={myTasks} today={today} clientName={isClient ? undefined : clientName} />
        </div>
      </div>
    </div>
  );
}

function byPriorityThenAge<T extends { priority: Ticket["priority"]; created_at: Date }>(a: T, b: T) {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at.getTime() - b.created_at.getTime();
}

function TicketList({ title, tickets, clientName }: { title: string; tickets: Ticket[]; clientName?: (id: string) => string }) {
  const rows = [...tickets].sort(byPriorityThenAge).slice(0, 8);
  return (
    <Card title={title} actions={<Link to="/helpdesk" className="text-xs font-medium text-brand-700">View all</Link>}>
      {rows.length === 0 ? (
        <Empty>No open tickets. 🎉</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => (
            <li key={t.id}>
              <Link to={`/helpdesk/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    <span className="font-mono text-xs text-slate-400">#{shortId(t.id)}</span> {t.subject}
                  </p>
                  <p className="text-xs text-slate-500">
                    {clientName ? `${clientName(t.client_id)} · ` : ""}
                    {t.assignee_name ?? "Unassigned"} · updated {timeAgo(t.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Badge tone={PRIORITY_TONES[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                  <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskList({ title, tasks, today, clientName }: { title: string; tasks: Task[]; today: string; clientName?: (id: string) => string }) {
  const rows = [...tasks]
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 8);
  return (
    <Card title={title} actions={<Link to="/tasks" className="text-xs font-medium text-brand-700">View all</Link>}>
      {rows.length === 0 ? (
        <Empty>Nothing on the list.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => (
            <li key={t.id} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{t.title}</p>
                <Badge tone={TASK_STATUS_TONES[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {clientName ? `${clientName(t.client_id)} · ` : ""}
                {t.assignee_name ?? "Unassigned"}
                {t.due_date && (
                  <span className={t.due_date < today ? " font-medium text-red-600" : ""}> · due {t.due_date}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
