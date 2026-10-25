import { useMemo, useState, type FormEvent } from "react";
import EntryTable from "../components/EntryTable";
import { buttonClass, Card, ErrorNote, Field, inputClass, LiveDot, Modal, PageHeader, StatCard } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { entryDuration, TimeApi, toEntry } from "../firebase/time";
import { downloadCsv } from "../lib/csv";
import { addDays, formatHours, isoDay, startOfMonth, startOfWeek, toLocalInput } from "../lib/format";
import { useLiveQuery, useNow } from "../lib/useLive";
import type { TimeEntry } from "../types";

type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

function presetRange(preset: Preset, now: Date): [Date, Date] {
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  switch (preset) {
    case "this_week":
      return [week, addDays(week, 7)];
    case "last_week":
      return [addDays(week, -7), week];
    case "this_month":
      return [month, new Date(month.getFullYear(), month.getMonth() + 1, 1)];
    case "last_month":
      return [new Date(month.getFullYear(), month.getMonth() - 1, 1), month];
    default:
      return [week, addDays(week, 7)];
  }
}

export default function Timesheets() {
  const profile = useProfile();
  const { clients, staff } = useDirectory();
  const now = useNow(60_000);
  const isAdmin = profile.role === "admin";

  const [preset, setPreset] = useState<Preset>("this_week");
  const [customFrom, setCustomFrom] = useState(isoDay(addDays(now, -14)));
  const [customTo, setCustomTo] = useState(isoDay(now));
  const [techFilter, setTechFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const customRange: [Date, Date] = [new Date(`${customFrom}T00:00`), addDays(new Date(`${customTo}T00:00`), 1)];
  const customValid = !customRange.some((d) => Number.isNaN(d.getTime())) && customRange[0] < customRange[1];
  const [from, to] = preset === "custom" && customValid ? customRange : presetRange(preset, now);

  const { data, loading, error } = useLiveQuery(
    TimeApi.rangeQuery(profile, from, to),
    toEntry,
    `sheet:${profile.id}:${profile.role}:${from.getTime()}:${to.getTime()}`,
  );

  const entries = useMemo(
    () =>
      data
        .filter((e) => (!techFilter || e.tech_id === techFilter) && (!clientFilter || e.client_id === clientFilter))
        .sort((a, b) => b.clock_in.getTime() - a.clock_in.getTime()),
    [data, techFilter, clientFilter],
  );

  const total = entries.reduce((sum, e) => sum + entryDuration(e, now), 0);
  const byTech = totals(entries, (e) => e.tech_name, now);
  const byClient = totals(entries, (e) => e.client_name, now);
  const edited = entries.filter((e) => e.edit_reason).length;
  const techNames = Array.from(new Map(data.map((e) => [e.tech_id, e.tech_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]));

  function exportCsv() {
    downloadCsv(
      `timesheet-${isoDay(from)}-to-${isoDay(addDays(to, -1))}.csv`,
      ["Date", "Technician", "Client", "Clock in", "Clock out", "Hours", "Notes", "Edited", "Edit reason", "Original clock in", "Original clock out"],
      [...entries].reverse().map((e) => [
        isoDay(e.clock_in),
        e.tech_name,
        e.client_name,
        e.clock_in.toISOString(),
        e.clock_out?.toISOString() ?? "still clocked in",
        formatHours(entryDuration(e, now)),
        e.notes,
        e.edit_reason ? "yes" : "no",
        e.edit_reason ?? "",
        e.original?.clock_in.toISOString() ?? "",
        e.original?.clock_out?.toISOString() ?? "",
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Timesheets"
        subtitle={
          <span className="flex items-center gap-2">
            {profile.role === "client" ? "Every hour Tauri has worked for you." : profile.role === "tech" ? "Your recorded hours." : "Hours across the whole team."}
            <LiveDot />
          </span>
        }
        actions={
          <>
            {isAdmin && (
              <button className={buttonClass.secondary} onClick={() => setAdding(true)}>
                Add missed shift
              </button>
            )}
            <button className={buttonClass.primary} onClick={exportCsv} disabled={entries.length === 0}>
              Export CSV
            </button>
          </>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Period">
            <select className={inputClass} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="this_week">This week</option>
              <option value="last_week">Last week</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom…</option>
            </select>
          </Field>
          {preset === "custom" && (
            <>
              <Field label="From">
                <input type="date" className={inputClass} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <input type="date" className={inputClass} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </Field>
            </>
          )}
          {profile.role !== "tech" && (
            <Field label="Technician">
              <select className={inputClass} value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
                <option value="">Everyone</option>
                {techNames.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </Field>
          )}
          {profile.role !== "client" && (
            <Field label="Client">
              <select className={inputClass} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total hours" value={formatHours(total)} />
        <StatCard label="Entries" value={entries.length} />
        <StatCard label="Technicians" value={byTech.length} />
        <StatCard label="Edited by admin" value={edited} tone={edited ? "warning" : "default"} hint="Every correction keeps its reason" />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Card title="Entries">
            <ErrorNote error={error} />
            {loading ? <div className="h-32 animate-pulse rounded bg-slate-100" /> : (
              <EntryTable
                entries={entries}
                showTech={profile.role !== "tech"}
                showClient={profile.role !== "client"}
                onEdit={isAdmin ? setEditing : undefined}
              />
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {profile.role !== "tech" && <Totals title="By technician" rows={byTech} />}
          {profile.role !== "client" && <Totals title="By client" rows={byClient} />}
        </div>
      </div>

      {editing && <CorrectEntry entry={editing} onClose={() => setEditing(null)} />}
      {adding && <AddShift techs={staff} onClose={() => setAdding(false)} />}
    </div>
  );
}

function totals(entries: TimeEntry[], keyOf: (e: TimeEntry) => string, now: Date): [string, number][] {
  const map = new Map<string, number>();
  for (const e of entries) map.set(keyOf(e), (map.get(keyOf(e)) ?? 0) + entryDuration(e, now));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function Totals({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, ms]) => ms));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(([name, ms]) => (
            <li key={name}>
              <div className="flex justify-between text-sm">
                <span className="truncate text-slate-700">{name}</span>
                <span className="tabular-nums font-medium text-slate-900">{formatHours(ms)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(ms / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CorrectEntry({ entry, onClose }: { entry: TimeEntry; onClose: () => void }) {
  const admin = useProfile();
  const { clients } = useDirectory();
  const [clockIn, setClockIn] = useState(toLocalInput(entry.clock_in));
  const [clockOut, setClockOut] = useState(toLocalInput(entry.clock_out ?? new Date()));
  const [clientId, setClientId] = useState(entry.client_id);
  const [notes, setNotes] = useState(entry.notes);
  const [reason, setReason] = useState(entry.clock_out ? "" : "Forgot to clock out");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    if (!(end > start)) return setError(new Error("Clock out must be after clock in"));
    if (end > new Date()) return setError(new Error("Clock out can't be in the future"));
    const client = clients.find((c) => c.id === clientId);
    setBusy(true);
    try {
      await TimeApi.correct(admin, entry, { clock_in: start, clock_out: end, client, notes }, reason);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title={entry.clock_out ? `Correct ${entry.tech_name}'s entry` : `Clock out ${entry.tech_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Corrections are visible to the tech and the client, with your reason. The original punch is kept.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clock in">
            <input type="datetime-local" className={inputClass} value={clockIn} onChange={(e) => setClockIn(e.target.value)} required />
          </Field>
          <Field label="Clock out">
            <input type="datetime-local" className={inputClass} value={clockOut} onChange={(e) => setClockOut(e.target.value)} required />
          </Field>
        </div>
        <Field label="Client">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Reason for the change">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Tech forgot to clock out" />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>Save correction</button>
        </div>
      </form>
    </Modal>
  );
}

function AddShift({ techs, onClose }: { techs: { id: string; full_name: string }[]; onClose: () => void }) {
  const admin = useProfile();
  const { clients } = useDirectory();
  const [techId, setTechId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clockIn, setClockIn] = useState(toLocalInput(addDays(new Date(), -1)));
  const [clockOut, setClockOut] = useState(toLocalInput(new Date(Date.now() - 23 * 60 * 60 * 1000)));
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const tech = techs.find((t) => t.id === techId);
    const client = clients.find((c) => c.id === clientId);
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    if (!tech || !client) return setError(new Error("Choose the technician and the client"));
    if (!(end > start)) return setError(new Error("Clock out must be after clock in"));
    if (end > new Date()) return setError(new Error("Clock out can't be in the future"));
    setBusy(true);
    try {
      await TimeApi.addManual(admin, tech, { client, clock_in: start, clock_out: end, notes }, reason);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a missed shift" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">The entry is marked "Added by admin" with your reason, for the tech and the client to see.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Technician">
            <select className={inputClass} value={techId} onChange={(e) => setTechId(e.target.value)} required>
              <option value="">Choose…</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Client">
            <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Choose…</option>
              {clients.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Clock in">
            <input type="datetime-local" className={inputClass} value={clockIn} onChange={(e) => setClockIn(e.target.value)} required />
          </Field>
          <Field label="Clock out">
            <input type="datetime-local" className={inputClass} value={clockOut} onChange={(e) => setClockOut(e.target.value)} required />
          </Field>
        </div>
        <Field label="Notes">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Reason">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Paper timesheet from site visit" />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>Add shift</button>
        </div>
      </form>
    </Modal>
  );
}
