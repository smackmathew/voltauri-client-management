import { useState, type FormEvent } from "react";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, Modal, PageHeader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { TeamApi, toInvite } from "../firebase/team";
import { TimeApi, toEntry } from "../firebase/time";
import { timeAgo } from "../lib/format";
import { ROLE_LABELS } from "../lib/labels";
import { useLiveQuery } from "../lib/useLive";
import type { Profile, Role } from "../types";

export default function Team() {
  const profile = useProfile();
  const { people, clientName } = useDirectory();
  const invites = useLiveQuery(TeamApi.pendingInvitesQuery(), toInvite, `invites:${profile.id}`);
  const open = useLiveQuery(TimeApi.openQuery(profile), toEntry, `team-open:${profile.id}`);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [error, setError] = useState<unknown>(null);

  const staff = people.filter((p) => p.role !== "client");
  const clientUsers = people.filter((p) => p.role === "client");

  const row = (p: Profile) => {
    const entry = open.data.find((e) => e.tech_id === p.id);
    return (
      <tr key={p.id} className={p.active ? "" : "opacity-50"}>
        <td className="px-4 py-2">
          <p className="font-medium text-slate-800">{p.full_name}{p.id === profile.id && <span className="text-slate-400"> (you)</span>}</p>
          <p className="text-xs text-slate-500">{p.email}</p>
        </td>
        <td className="px-4 py-2">
          <Badge tone={p.role === "admin" ? "violet" : p.role === "tech" ? "blue" : "slate"}>{ROLE_LABELS[p.role]}</Badge>
          {p.client_id && <span className="ml-2 text-xs text-slate-500">{clientName(p.client_id)}</span>}
        </td>
        <td className="px-4 py-2 text-xs">
          {!p.active ? <Badge>Deactivated</Badge> : entry ? <Badge tone="green">Clocked in · {entry.client_name}</Badge> : p.role !== "client" ? <span className="text-slate-400">Off the clock</span> : null}
        </td>
        <td className="px-4 py-2 text-right">
          {p.id !== profile.id && <button className="text-xs font-medium text-brand-700" onClick={() => setEditing(p)}>Edit</button>}
        </td>
      </tr>
    );
  };

  const table = (rows: Profile[]) =>
    rows.length === 0 ? <Empty>Nobody yet.</Empty> : (
      <div className="-mx-4 overflow-x-auto">
        <table className="min-w-full text-sm"><tbody className="divide-y divide-slate-100">{rows.map(row)}</tbody></table>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Employees, client portal users and invites."
        actions={<button className={buttonClass.primary} onClick={() => setInviting(true)}>Invite someone</button>}
      />
      <ErrorNote error={error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Tauri staff (${staff.length})`}>{table(staff)}</Card>
          <Card title={`Client portal users (${clientUsers.length})`}>{table(clientUsers)}</Card>
        </div>
        <Card title="Pending invites">
          {invites.data.length === 0 ? (
            <Empty>No pending invites.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...invites.data].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).map((inv) => (
                <li key={inv.code} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      className="font-mono text-sm font-semibold tracking-widest text-slate-800 hover:text-brand-700"
                      title="Copy"
                      onClick={() => navigator.clipboard?.writeText(inv.code)}
                    >
                      {inv.code}
                    </button>
                    <button className="text-xs text-red-600 hover:text-red-700" onClick={() => TeamApi.revokeInvite(inv.code).catch(setError)}>Revoke</button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABELS[inv.role]}{inv.client_id && ` · ${clientName(inv.client_id)}`}{inv.email && ` · ${inv.email}`} · {timeAgo(inv.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {inviting && <InviteForm onClose={() => setInviting(false)} />}
      {editing && <PersonForm person={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoleAndClient({ role, clientId, onRole, onClient }: { role: Role; clientId: string; onRole: (r: Role) => void; onClient: (c: string) => void }) {
  const { clients } = useDirectory();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Role">
        <select className={inputClass} value={role} onChange={(e) => onRole(e.target.value as Role)}>
          <option value="tech">Technician</option>
          <option value="admin">Admin</option>
          <option value="client">Client portal user</option>
        </select>
      </Field>
      {role === "client" && (
        <Field label="Client company">
          <select className={inputClass} required value={clientId} onChange={(e) => onClient(e.target.value)}>
            <option value="">Choose…</option>
            {clients.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [role, setRole] = useState<Role>("tech");
  const [clientId, setClientId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      setCode(await TeamApi.createInvite({ role, client_id: clientId || null, email }, profile.id));
    } catch (err) {
      setError(err);
    }
  }

  if (code) {
    return (
      <Modal title="Invite created" onClose={onClose}>
        <p className="text-sm text-slate-600">Send this code to them. They choose "I have an invite code" on the sign-in page. It works once.</p>
        <p className="my-4 rounded-lg bg-slate-100 py-4 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-slate-900">{code}</p>
        <div className="flex justify-end gap-2">
          <button className={buttonClass.secondary} onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
          <button className={buttonClass.primary} onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Invite someone" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <RoleAndClient role={role} clientId={clientId} onRole={setRole} onClient={setClientId} />
        <Field label="Their email (optional)" hint="If given, only this email can use the code.">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary}>Create invite code</button>
        </div>
      </form>
    </Modal>
  );
}

function PersonForm({ person, onClose }: { person: Profile; onClose: () => void }) {
  const [fullName, setFullName] = useState(person.full_name);
  const [role, setRole] = useState<Role>(person.role);
  const [clientId, setClientId] = useState(person.client_id ?? "");
  const [active, setActive] = useState(person.active);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await TeamApi.updatePerson(person.id, { full_name: fullName.trim(), role, client_id: role === "client" ? clientId : null, active });
      onClose();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal title={`Edit ${person.full_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className={inputClass} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <RoleAndClient role={role} clientId={clientId} onRole={setRole} onClient={setClientId} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (deactivated accounts can't see anything)
        </label>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
