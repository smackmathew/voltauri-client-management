import { useState, type FormEvent } from "react";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, Modal, PageHeader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { TeamApi, toInvite } from "../firebase/team";
import { TimeApi, toEntry } from "../firebase/time";
import { formatMoney, parseMoney } from "../lib/billing";
import { timeAgo } from "../lib/format";
import { ROLE_LABELS } from "../lib/labels";
import { useLiveDoc, useLiveQuery } from "../lib/useLive";
import type { EmployeePrivate, Profile, Role } from "../types";

export default function Team() {
  const profile = useProfile();
  const { people, clientName, org } = useDirectory();
  const invites = useLiveQuery(TeamApi.pendingInvitesQuery(), toInvite, `invites:${profile.id}`);
  const open = useLiveQuery(TimeApi.openQuery(profile), toEntry, `team-open:${profile.id}`);
  // Pay rates, keyed by employee id. Admins only (this page is admin-only).
  const privateDocs = useLiveQuery(TeamApi.privateQuery(), (snap) => ({ id: snap.id, ...TeamApi.toPrivate(snap) }), `private:${profile.id}`);
  const payRate = new Map(privateDocs.data.map((d) => [d.id, d.pay_rate_cents]));
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
          {p.job_title && <p className="text-xs text-slate-600">{p.job_title}</p>}
          <p className="text-xs text-slate-500">
            {p.email}
            {p.phone && <> · <a className="hover:text-brand-700" href={`tel:${p.phone}`}>{p.phone}</a></>}
          </p>
        </td>
        <td className="px-4 py-2">
          <Badge tone={p.role === "admin" ? "violet" : p.role === "tech" ? "blue" : "slate"}>{ROLE_LABELS[p.role]}</Badge>
          {p.client_id && <span className="ml-2 text-xs text-slate-500">{clientName(p.client_id)}</span>}
        </td>
        <td className="px-4 py-2 text-xs">
          {!p.active ? <Badge>Deactivated</Badge> : entry ? <Badge tone="green">Clocked in · {entry.client_name}</Badge> : p.role !== "client" ? <span className="text-slate-400">Off the clock</span> : null}
        </td>
        {p.role !== "client" && (
          <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-slate-500" title="Pay rate (only admins see this)">
            {payRate.get(p.id) != null ? `${formatMoney(payRate.get(p.id)!, org?.currency)}/h` : "—"}
          </td>
        )}
        <td className="px-4 py-2 text-right">
          <button className="text-xs font-medium text-brand-700" onClick={() => setEditing(p)}>Edit</button>
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
          <Card title={`Voltauri staff (${staff.length})`}>{table(staff)}</Card>
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
  const admin = useProfile();
  const { org } = useDirectory();
  const isSelf = person.id === admin.id;
  const [fullName, setFullName] = useState(person.full_name);
  const [role, setRole] = useState<Role>(person.role);
  const [clientId, setClientId] = useState(person.client_id ?? "");
  const [active, setActive] = useState(person.active);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [jobTitle, setJobTitle] = useState(person.job_title ?? "");
  const [startDate, setStartDate] = useState(person.start_date ?? "");
  const isStaffRole = role !== "client";

  // Private details load separately; they live in an admins-only record.
  const stored = useLiveDoc(TeamApi.privateDoc(person.id), TeamApi.toPrivate, `private:${person.id}`);
  const [pay, setPay] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const payText = pay ?? (stored.data?.pay_rate_cents != null ? (stored.data.pay_rate_cents / 100).toFixed(2) : "");
  const notesText = notes ?? stored.data?.notes ?? "";

  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const privateDetails: EmployeePrivate | null = isStaffRole ? { pay_rate_cents: parseMoney(payText), notes: notesText } : null;
    try {
      await TeamApi.saveEmployee(
        admin,
        person,
        { full_name: fullName, role, client_id: role === "client" ? clientId : null, active, phone, job_title: jobTitle, start_date: startDate },
        privateDetails,
      );
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title={isSelf ? "Edit your profile" : `Edit ${person.full_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className={inputClass} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Email: {person.email} <span className="text-slate-400">(the sign-in address can't be changed here)</span></p>
        {isSelf ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">You're an admin. You can't remove your own admin role or deactivate yourself; another admin can.</p>
        ) : (
          <>
            <RoleAndClient role={role} clientId={clientId} onRole={setRole} onClient={setClientId} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (deactivated accounts can't see anything)
            </label>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Job title">
            <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={isStaffRole ? "e.g. Field technician" : "e.g. Office manager"} />
          </Field>
          {isStaffRole && (
            <Field label="Start date">
              <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          )}
        </div>
        {isStaffRole && (
          <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Admins only</legend>
            <Field label="Pay rate (per hour)" hint="Used for labor cost on Timesheets. Techs never see it.">
              <input className={inputClass} inputMode="decimal" placeholder={`e.g. ${formatMoney(3500, org?.currency)}`} value={payText} onChange={(e) => setPay(e.target.value)} />
            </Field>
            <Field label="Private notes" hint="Certifications, emergency contact, anything else.">
              <textarea className={inputClass} rows={3} value={notesText} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </fieldset>
        )}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy || stored.loading}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
