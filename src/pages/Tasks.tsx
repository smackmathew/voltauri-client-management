import { useMemo, useState, type FormEvent } from "react";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, LiveDot, Modal, PageHeader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { TasksApi, toTask, type TaskInput } from "../firebase/tasks";
import { isoDay } from "../lib/format";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_TONES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
} from "../lib/labels";
import { useLiveQuery } from "../lib/useLive";
import type { Task, TaskStatus } from "../types";

export default function Tasks() {
  const profile = useProfile();
  const { clientName, clients, staff } = useDirectory();
  const isStaff = profile.role !== "client";
  const { data, loading, error } = useLiveQuery(TasksApi.visibleQuery(profile), toTask, `tasks:${profile.id}:${profile.role}`);

  const [view, setView] = useState<"board" | "list">("board");
  const [clientFilter, setClientFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState(profile.role === "tech" ? profile.id : "");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const today = isoDay(new Date());

  const tasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((t) => !clientFilter || t.client_id === clientFilter)
      .filter((t) => !assigneeFilter || (assigneeFilter === "none" ? !t.assignee_id : t.assignee_id === assigneeFilter))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  }, [data, clientFilter, assigneeFilter, search]);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={<span className="flex items-center gap-2">{isStaff ? "Planned work for every client." : "Work Tauri has planned for you."} <LiveDot /></span>}
        actions={
          <>
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
              {(["board", "list"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`rounded px-3 py-1 capitalize ${view === v ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600"}`}>
                  {v}
                </button>
              ))}
            </div>
            {isStaff && (
              <button className={buttonClass.primary} onClick={() => setEditing("new")}>
                New task
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <input className={inputClass} placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isStaff && (
          <>
            <select className={inputClass} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className={inputClass} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">Anyone</option>
              <option value="none">Unassigned</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>{p.id === profile.id ? `${p.full_name} (me)` : p.full_name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <ErrorNote error={error} />
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => {
            const column = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="rounded-xl bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-700">{TASK_STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-slate-500">{column.length}</span>
                </div>
                <div className="space-y-2">
                  {column.map((t) => (
                    <TaskCard key={t.id} task={t} today={today} clientName={isStaff ? clientName(t.client_id) : null} canEdit={isStaff} onOpen={() => setEditing(t)} />
                  ))}
                  {column.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">Nothing here</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          {tasks.length === 0 ? (
            <Empty>No tasks match.</Empty>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">Task</th>
                    {isStaff && <th className="px-4 py-2">Client</th>}
                    <th className="px-4 py-2">Assignee</th>
                    <th className="px-4 py-2">Priority</th>
                    <th className="px-4 py-2">Due</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((t) => (
                    <tr key={t.id} className={isStaff ? "cursor-pointer hover:bg-slate-50" : ""} onClick={() => isStaff && setEditing(t)}>
                      <td className="px-4 py-2 font-medium text-slate-800">{t.title}</td>
                      {isStaff && <td className="px-4 py-2 text-slate-600">{clientName(t.client_id)}</td>}
                      <td className="px-4 py-2 text-slate-600">{t.assignee_name ?? "—"}</td>
                      <td className="px-4 py-2"><Badge tone={PRIORITY_TONES[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge></td>
                      <td className={`px-4 py-2 tabular-nums ${t.due_date && t.due_date < today && t.status !== "done" ? "font-medium text-red-600" : "text-slate-600"}`}>{t.due_date ?? "—"}</td>
                      <td className="px-4 py-2"><Badge tone={TASK_STATUS_TONES[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && <TaskForm task={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TaskCard({ task, today, clientName, canEdit, onOpen }: { task: Task; today: string; clientName: string | null; canEdit: boolean; onOpen: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const overdue = task.due_date && task.due_date < today && task.status !== "done";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <button disabled={!canEdit} onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">{task.title}</p>
          <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
        </div>
        {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p>}
        <p className="mt-2 text-xs text-slate-500">
          {clientName && <span className="font-medium text-slate-600">{clientName} · </span>}
          {task.assignee_name ?? "Unassigned"}
          {task.due_date && <span className={overdue ? " font-medium text-red-600" : ""}> · due {task.due_date}</span>}
        </p>
      </button>
      {canEdit && (
        <select
          aria-label="Move to"
          className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
          value={task.status}
          onChange={(e) => TasksApi.setStatus(task, e.target.value as TaskStatus).catch(setError)}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

function TaskForm({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const profile = useProfile();
  const { clients, staff } = useDirectory();
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    client_id: task?.client_id ?? "",
    assignee_id: task?.assignee_id ?? "",
    status: task?.status ?? ("todo" as TaskStatus),
    priority: task?.priority ?? "normal",
    due_date: task?.due_date ?? "",
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const assignee = staff.find((p) => p.id === form.assignee_id);
    const input: TaskInput = {
      title: form.title,
      description: form.description,
      client_id: form.client_id,
      assignee: assignee ? { id: assignee.id, name: assignee.full_name } : task?.assignee_id && form.assignee_id === task.assignee_id ? { id: task.assignee_id, name: task.assignee_name ?? "" } : null,
      status: form.status,
      priority: form.priority as TaskInput["priority"],
      due_date: form.due_date || null,
    };
    setBusy(true);
    try {
      if (task) await TasksApi.update(task, input);
      else await TasksApi.create(input, profile.id);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function remove() {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;
    try {
      await TasksApi.remove(task.id);
      onClose();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input className={inputClass} required value={form.title} onChange={set("title")} autoFocus />
        </Field>
        <Field label="Details">
          <textarea className={inputClass} rows={3} value={form.description} onChange={set("description")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <select className={inputClass} required value={form.client_id} onChange={set("client_id")}>
              <option value="">Choose…</option>
              {clients.filter((c) => c.active || c.id === task?.client_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select className={inputClass} value={form.assignee_id} onChange={set("assignee_id")}>
              <option value="">Unassigned</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={set("status")}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" className={inputClass} value={form.due_date} onChange={set("due_date")} />
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="flex items-center justify-between gap-2">
          {task && profile.role === "admin" ? (
            <button type="button" onClick={remove} className="text-sm font-medium text-red-600 hover:text-red-700">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={buttonClass.primary} disabled={busy}>{task ? "Save" : "Create task"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
