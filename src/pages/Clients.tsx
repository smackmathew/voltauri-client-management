import { useMemo, useState, type FormEvent } from "react";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, Modal, PageHeader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { ClientsApi, type ClientInput } from "../firebase/clients";
import { TasksApi, toTask } from "../firebase/tasks";
import { isClosedStatus, TicketsApi, toTicket } from "../firebase/tickets";
import { TimeApi, toEntry } from "../firebase/time";
import { useLiveQuery } from "../lib/useLive";
import type { Client } from "../types";

export default function Clients() {
  const profile = useProfile();
  const { clients, people } = useDirectory();
  const isAdmin = profile.role === "admin";
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const tickets = useLiveQuery(TicketsApi.visibleQuery(profile), toTicket, `clients-tickets:${profile.id}`);
  const tasks = useLiveQuery(TasksApi.visibleQuery(profile), toTask, `clients-tasks:${profile.id}`);
  const open = useLiveQuery(TimeApi.openQuery(profile), toEntry, `clients-open:${profile.id}:${profile.role}`);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => showInactive || c.active)
      .filter((c) => !q || [c.name, c.contact_name, c.email].some((v) => v?.toLowerCase().includes(q)));
  }, [clients, showInactive, search]);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${clients.filter((c) => c.active).length} active clients`}
        actions={isAdmin && <button className={buttonClass.primary} onClick={() => setEditing("new")}>Add client</button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input className={`${inputClass} max-w-xs`} placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>
      {rows.length === 0 ? (
        <Card><Empty>{isAdmin ? "No clients yet. Add your first one." : "No clients yet."}</Empty></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const openTickets = tickets.data.filter((t) => t.client_id === c.id && !isClosedStatus(t.status)).length;
            const openTasks = tasks.data.filter((t) => t.client_id === c.id && t.status !== "done").length;
            const working = open.data.filter((e) => e.client_id === c.id);
            const users = people.filter((p) => p.client_id === c.id);
            return (
              <Card key={c.id} className={c.active ? "" : "opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-slate-900">{c.name}</h2>
                    {c.contact_name && <p className="text-sm text-slate-600">{c.contact_name}</p>}
                  </div>
                  {!c.active && <Badge>Inactive</Badge>}
                  {working.length > 0 && <Badge tone="green">{working.map((e) => e.tech_name.split(" ")[0]).join(", ")} on site</Badge>}
                </div>
                <div className="mt-2 space-y-0.5 text-sm text-slate-500">
                  {c.email && <p><a className="hover:text-brand-700" href={`mailto:${c.email}`}>{c.email}</a></p>}
                  {c.phone && <p><a className="hover:text-brand-700" href={`tel:${c.phone}`}>{c.phone}</a></p>}
                  {c.address && <p className="whitespace-pre-line">{c.address}</p>}
                </div>
                {c.notes && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{c.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs">
                  <Badge tone={openTickets ? "amber" : "slate"}>{openTickets} open tickets</Badge>
                  <Badge tone={openTasks ? "blue" : "slate"}>{openTasks} open tasks</Badge>
                  <Badge>{users.length} portal users</Badge>
                </div>
                {isAdmin && (
                  <button onClick={() => setEditing(c)} className={`${buttonClass.link} mt-3`}>Edit</button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {editing && <ClientForm client={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClientForm({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const [form, setForm] = useState<ClientInput>({
    name: client?.name ?? "",
    contact_name: client?.contact_name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    address: client?.address ?? "",
    notes: client?.notes ?? "",
    active: client?.active ?? true,
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ClientInput) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (client) await ClientsApi.update(client.id, form);
      else await ClientsApi.create(form);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title={client ? `Edit ${client.name}` : "Add client"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Company name">
          <input className={inputClass} required value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Main contact">
            <input className={inputClass} value={form.contact_name ?? ""} onChange={set("contact_name")} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} type="tel" value={form.phone ?? ""} onChange={set("phone")} />
          </Field>
        </div>
        <Field label="Email">
          <input className={inputClass} type="email" value={form.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="Address">
          <textarea className={inputClass} rows={2} value={form.address ?? ""} onChange={set("address")} />
        </Field>
        <Field label="Notes" hint="Visible to the client's own users too.">
          <textarea className={inputClass} rows={3} value={form.notes ?? ""} onChange={set("notes")} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active (techs can clock in for this client)
        </label>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>{client ? "Save" : "Add client"}</button>
        </div>
      </form>
    </Modal>
  );
}
