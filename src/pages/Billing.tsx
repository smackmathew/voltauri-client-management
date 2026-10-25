import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, buttonClass, Card, Empty, ErrorNote, Field, inputClass, LiveDot, Modal, PageHeader, StatCard } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { updateOrganization } from "../firebase/account";
import { InvoicesApi, MAX_ENTRIES_PER_INVOICE, toInvoice } from "../firebase/invoices";
import { TimeApi, toEntry } from "../firebase/time";
import {
  BILLING_INCREMENTS,
  billableMinutes,
  formatInvoiceNumber,
  formatMoney,
  lineAmount,
  parseMoney,
  parsePercent,
  rateFor,
} from "../lib/billing";
import { addDays, formatDate, formatHours, formatTime, isoDay, startOfMonth } from "../lib/format";
import { useLiveQuery } from "../lib/useLive";
import type { Client, Invoice, Organization, TimeEntry } from "../types";
import { INVOICE_STATUS, invoiceState } from "./invoiceStatus";

type Period = "last_month" | "this_month" | "custom";

function periodRange(period: Period, customFrom: string, customTo: string): { start: string; end: string } {
  const month = startOfMonth(new Date());
  if (period === "this_month") return { start: isoDay(month), end: isoDay(addDays(new Date(month.getFullYear(), month.getMonth() + 1, 1), -1)) };
  if (period === "last_month") return { start: isoDay(new Date(month.getFullYear(), month.getMonth() - 1, 1)), end: isoDay(addDays(month, -1)) };
  return { start: customFrom, end: customTo };
}

export default function Billing() {
  const profile = useProfile();
  const { clients, org } = useDirectory();
  const [period, setPeriod] = useState<Period>("last_month");
  const [customFrom, setCustomFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [customTo, setCustomTo] = useState(isoDay(new Date()));
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "outstanding" | "paid" | "void">("all");
  const [creating, setCreating] = useState<Client | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);

  const range = periodRange(period, customFrom, customTo);
  const from = new Date(`${range.start}T00:00`);
  const to = addDays(new Date(`${range.end}T00:00`), 1);
  const validRange = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to;

  const time = useLiveQuery(
    validRange ? TimeApi.rangeQuery(profile, from, to) : null,
    toEntry,
    `billing-time:${range.start}:${range.end}:${validRange}`,
  );
  const invoices = useLiveQuery(InvoicesApi.visibleQuery(profile), toInvoice, `invoices:${profile.id}`);

  const unbilledByClient = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of time.data) {
      if (!e.clock_out || e.invoice_id) continue;
      map.set(e.client_id, [...(map.get(e.client_id) ?? []), e]);
    }
    return map;
  }, [time.data]);

  const today = isoDay(new Date());
  const outstanding = invoices.data.filter((i) => i.status === "sent");
  const overdue = outstanding.filter((i) => i.due_date < today);
  const paidThisMonth = invoices.data.filter((i) => i.status === "paid" && i.paid_at && i.paid_at >= startOfMonth(new Date()));
  const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.total_cents, 0);
  const currency = org?.currency ?? "USD";

  const unbilledRows = clients
    .map((client) => {
      const entries = unbilledByClient.get(client.id) ?? [];
      const rate = org ? rateFor(client, org) : 0;
      const increment = org?.billing_increment_minutes ?? 15;
      const actual = entries.reduce((s, e) => s + (e.clock_out!.getTime() - e.clock_in.getTime()), 0);
      const billed = entries.reduce((s, e) => s + billableMinutes(e.clock_out!.getTime() - e.clock_in.getTime(), increment), 0);
      return { client, entries, rate, actual, billedMinutes: billed, amount: entries.reduce((s, e) => s + lineAmount(billableMinutes(e.clock_out!.getTime() - e.clock_in.getTime(), increment), rate), 0) };
    })
    .filter((r) => r.entries.length > 0)
    .sort((a, b) => b.amount - a.amount);

  const listed = [...invoices.data]
    .filter((i) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "outstanding") return i.status === "sent";
      return i.status === statusFilter;
    })
    .sort((a, b) => b.number - a.number);

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle={<span className="flex items-center gap-2">Turn tracked time into invoices. <LiveDot /></span>}
        actions={<button className={buttonClass.secondary} onClick={() => setEditingSettings(true)}>Billing settings</button>}
      />

      {org && org.default_rate_cents === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No default hourly rate yet. Set one in <button className="font-medium underline" onClick={() => setEditingSettings(true)}>billing settings</button>, or give each client its own rate on the Clients page.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatMoney(sum(outstanding), currency)} hint={`${outstanding.length} sent, unpaid`} />
        <StatCard label="Overdue" value={formatMoney(sum(overdue), currency)} tone={overdue.length ? "negative" : "default"} hint={`${overdue.length} past due date`} />
        <StatCard label="Paid this month" value={formatMoney(sum(paidThisMonth), currency)} tone="positive" />
        <StatCard
          label="Unbilled in period"
          value={formatMoney(unbilledRows.reduce((s, r) => s + r.amount, 0), currency)}
          hint={`${formatHours(unbilledRows.reduce((s, r) => s + r.billedMinutes * 60_000, 0))} billable hours`}
        />
      </div>

      <Card
        className="mb-6"
        title="Unbilled time"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="last_month">Last month</option>
              <option value="this_month">This month</option>
              <option value="custom">Custom…</option>
            </select>
            {period === "custom" && (
              <>
                <input type="date" aria-label="From" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <input type="date" aria-label="To" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
          </div>
        }
      >
        <ErrorNote error={time.error} />
        {unbilledRows.length === 0 ? (
          <Empty>No unbilled time from {formatDate(from)} to {formatDate(addDays(to, -1))}.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2 text-right">Entries</th>
                  <th className="px-4 py-2 text-right">Worked</th>
                  <th className="px-4 py-2 text-right">Billable</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unbilledRows.map((r) => (
                  <tr key={r.client.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.client.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.entries.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatHours(r.actual)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatHours(r.billedMinutes * 60_000)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.rate, currency)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(r.amount, currency)}</td>
                    <td className="px-4 py-2 text-right">
                      <button className={buttonClass.link} onClick={() => setCreating(r.client)}>Create invoice</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Shows finished shifts that started in the period and aren't on an invoice yet. Each shift is billed rounded up to {org?.billing_increment_minutes ?? 15} minutes.
        </p>
      </Card>

      <Card
        title="Invoices"
        actions={
          <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            <option value="draft">Drafts</option>
            <option value="outstanding">Outstanding</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        }
      >
        <InvoiceTable invoices={listed} showClient />
      </Card>

      {creating && org && (
        <CreateInvoice
          client={creating}
          org={org}
          entries={unbilledByClient.get(creating.id) ?? []}
          period={range}
          onClose={() => setCreating(null)}
        />
      )}
      {editingSettings && org && <SettingsForm org={org} onClose={() => setEditingSettings(false)} />}
    </div>
  );
}

export function InvoiceTable({ invoices, showClient }: { invoices: Invoice[]; showClient: boolean }) {
  if (invoices.length === 0) return <Empty>No invoices yet.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Invoice</th>
            {showClient && <th className="px-4 py-2">Client</th>}
            <th className="px-4 py-2">Period</th>
            <th className="px-4 py-2">Issued</th>
            <th className="px-4 py-2">Due</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((i) => {
            const state = invoiceState(i);
            return (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/invoices/${i.id}`} className="font-mono font-medium text-brand-700 hover:text-brand-800">{formatInvoiceNumber(i.number)}</Link>
                </td>
                {showClient && <td className="px-4 py-2 text-slate-700">{i.client_name}</td>}
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{i.period_start} – {i.period_end}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{i.issue_date}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{i.due_date}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">{formatMoney(i.total_cents, i.currency)}</td>
                <td className="px-4 py-2"><Badge tone={INVOICE_STATUS[state].tone}>{INVOICE_STATUS[state].label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateInvoice({ client, org, entries, period, onClose }: { client: Client; org: Organization; entries: TimeEntry[]; period: { start: string; end: string }; onClose: () => void }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const sorted = [...entries].sort((a, b) => a.clock_in.getTime() - b.clock_in.getTime());
  // Everything is included by default; untick a shift (say, an accidental punch) to leave it unbilled.
  const [included, setIncluded] = useState(() => new Set(sorted.slice(0, MAX_ENTRIES_PER_INVOICE).map((e) => e.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const rate = rateFor(client, org);
  const chosen = sorted.filter((e) => included.has(e.id));
  const amount = chosen.reduce((s, e) => s + lineAmount(billableMinutes(e.clock_out!.getTime() - e.clock_in.getTime(), org.billing_increment_minutes), rate), 0);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const id = await InvoicesApi.createDraft(profile, org, client, chosen, period);
      navigate(`/invoices/${id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const toggle = (id: string) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIncluded(next);
  };

  return (
    <Modal title={`Invoice ${client.name}`} onClose={onClose}>
      <p className="text-sm text-slate-500">
        {formatInvoiceNumber(org.next_invoice_number)} · {period.start} to {period.end} · {formatMoney(rate, org.currency)}/h
        {client.hourly_rate_cents == null && " (company default)"}
      </p>
      <ul className="my-4 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {sorted.map((e) => {
          const minutes = billableMinutes(e.clock_out!.getTime() - e.clock_in.getTime(), org.billing_increment_minutes);
          return (
            <li key={e.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-1" checked={included.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800">{formatDate(e.clock_in)} · {e.tech_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {formatTime(e.clock_in)}–{formatTime(e.clock_out!)}{e.notes && ` · ${e.notes}`}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums text-slate-700">
                  {formatHours(minutes * 60_000)} h
                  <span className="block text-xs text-slate-500">{formatMoney(lineAmount(minutes, rate), org.currency)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {sorted.length > MAX_ENTRIES_PER_INVOICE && (
        <p className="mb-3 text-xs text-amber-700">An invoice holds up to {MAX_ENTRIES_PER_INVOICE} shifts; the rest stay unbilled for the next one.</p>
      )}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">{chosen.length} shifts · <span className="font-semibold text-slate-900">{formatMoney(amount, org.currency)}</span> before tax</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">This creates a draft. You can add parts or other charges, tax and notes before sending it. The client sees it once you mark it sent.</p>
      <ErrorNote error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button className={buttonClass.secondary} onClick={onClose}>Cancel</button>
        <button className={buttonClass.primary} disabled={busy || chosen.length === 0 || chosen.length > MAX_ENTRIES_PER_INVOICE} onClick={create}>Create draft</button>
      </div>
    </Modal>
  );
}

function SettingsForm({ org, onClose }: { org: Organization; onClose: () => void }) {
  const [name, setName] = useState(org.name);
  const [address, setAddress] = useState(org.address ?? "");
  const [currency, setCurrency] = useState(org.currency);
  const [rate, setRate] = useState((org.default_rate_cents / 100).toFixed(2));
  const [increment, setIncrement] = useState(org.billing_increment_minutes);
  const [tax, setTax] = useState((org.default_tax_rate_bp / 100).toString());
  const [terms, setTerms] = useState(String(org.payment_terms_days));
  const [instructions, setInstructions] = useState(org.payment_instructions ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateOrganization({
        name: name.trim(),
        address: address.trim() || null,
        currency: currency.trim().toUpperCase(),
        default_rate_cents: parseMoney(rate) ?? 0,
        billing_increment_minutes: increment,
        default_tax_rate_bp: parsePercent(tax),
        payment_terms_days: Math.max(0, Math.min(365, Math.round(Number(terms) || 0))),
        payment_instructions: instructions.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Billing settings" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Company name (on invoices)">
          <input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Company address">
          <textarea className={inputClass} rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default hourly rate" hint="For clients without their own rate.">
            <input className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Currency" hint="3-letter code, e.g. USD">
            <input className={`${inputClass} uppercase`} maxLength={3} pattern="[A-Za-z]{3}" required value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
          <Field label="Bill time in increments of">
            <select className={inputClass} value={increment} onChange={(e) => setIncrement(Number(e.target.value))}>
              {BILLING_INCREMENTS.map((m) => (
                <option key={m} value={m}>{m === 1 ? "1 minute (exact)" : `${m} minutes`}</option>
              ))}
            </select>
          </Field>
          <Field label="Default tax rate (%)">
            <input className={inputClass} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
          <Field label="Payment due after (days)">
            <input className={inputClass} type="number" min={0} max={365} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
        </div>
        <Field label="Payment instructions" hint="Printed on every invoice: bank details, payment link, cheque address…">
          <textarea className={inputClass} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-400">Changes apply to invoices you create from now on. Existing invoices keep the details they were made with.</p>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>Save settings</button>
        </div>
      </form>
    </Modal>
  );
}
