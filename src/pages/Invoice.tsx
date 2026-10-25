import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, buttonClass, Card, ErrorNote, inputClass, PageLoader } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { InvoicesApi, toInvoice } from "../firebase/invoices";
import { downloadCsv } from "../lib/csv";
import { extraAmount, formatInvoiceNumber, formatMoney, invoiceTotals, parseMoney, parsePercent } from "../lib/billing";
import { formatDateTime, formatHours } from "../lib/format";
import { useLiveDoc } from "../lib/useLive";
import type { Invoice as InvoiceType } from "../types";
import { INVOICE_STATUS, invoiceState } from "./invoiceStatus";

export default function Invoice() {
  const { id = "" } = useParams();
  const profile = useProfile();
  const isAdmin = profile.role === "admin";
  const { data: invoice, loading } = useLiveDoc(InvoicesApi.invoiceDoc(id), toInvoice, `invoice:${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (loading) return <PageLoader />;
  if (!invoice) {
    return (
      <Card>
        <p className="text-sm text-slate-500">This invoice doesn't exist or you don't have access to it.</p>
        <Link to={isAdmin ? "/billing" : "/invoices"} className={buttonClass.link}>Back to invoices</Link>
      </Card>
    );
  }

  const state = invoiceState(invoice);
  const money = (cents: number) => formatMoney(cents, invoice.currency);

  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `${formatInvoiceNumber(invoice!.number)}.csv`,
      ["Date", "Technician", "Description", "Hours worked", "Hours billed", "Rate", "Amount"],
      [
        ...invoice!.time_lines.map((l) => [l.date, l.tech_name, l.description, (l.actual_minutes / 60).toFixed(2), (l.minutes / 60).toFixed(2), (l.rate_cents / 100).toFixed(2), (l.amount_cents / 100).toFixed(2)]),
        ...invoice!.extra_lines.map((l) => ["", "", l.description, "", String(l.quantity), (l.unit_price_cents / 100).toFixed(2), (l.amount_cents / 100).toFixed(2)]),
        [],
        ["", "", "Subtotal", "", "", "", (invoice!.subtotal_cents / 100).toFixed(2)],
        ["", "", `Tax (${invoice!.tax_rate_bp / 100}%)`, "", "", "", (invoice!.tax_cents / 100).toFixed(2)],
        ["", "", "Total", "", "", "", (invoice!.total_cents / 100).toFixed(2)],
      ],
    );
  }

  const workedMinutes = invoice.time_lines.reduce((s, l) => s + l.minutes, 0);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={isAdmin ? "/billing" : "/invoices"} className="text-sm text-slate-500 hover:text-slate-700">← {isAdmin ? "Billing" : "Invoices"}</Link>
        <div className="flex flex-wrap gap-2">
          {isAdmin && invoice.status === "draft" && (
            <>
              <button className={buttonClass.secondary} disabled={busy} onClick={() => run(() => InvoicesApi.deleteDraft(invoice), "Delete this draft? Its time goes back to unbilled.")}>Delete draft</button>
              <button className={buttonClass.secondary} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
              <button className={buttonClass.primary} disabled={busy} onClick={() => run(() => InvoicesApi.markSent(invoice), "Mark as sent? The client will see it in their portal, and it can no longer be edited.")}>Mark as sent</button>
            </>
          )}
          {isAdmin && invoice.status === "sent" && (
            <>
              <button className={buttonClass.secondary} disabled={busy} onClick={() => run(() => InvoicesApi.void(invoice), "Void this invoice? Its time goes back to unbilled. The client will see it as void.")}>Void</button>
              <button className={`${buttonClass.primary} bg-emerald-600 hover:bg-emerald-700`} disabled={busy} onClick={() => run(() => InvoicesApi.markPaid(invoice))}>Mark paid</button>
            </>
          )}
          {isAdmin && invoice.status === "paid" && (
            <button className={buttonClass.secondary} disabled={busy} onClick={() => run(() => InvoicesApi.markUnpaid(invoice))}>Mark unpaid</button>
          )}
          <button className={buttonClass.secondary} onClick={exportCsv}>CSV</button>
          <button className={buttonClass.secondary} onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <div className="no-print"><ErrorNote error={error} /></div>
      {isAdmin && invoice.status === "draft" && (
        <p className="no-print mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
          Draft: the client can't see this yet. Its {invoice.time_lines.length} shifts are reserved for this invoice and can't be corrected while it exists.
        </p>
      )}

      <article className="invoice-sheet mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xl font-semibold text-slate-900">{invoice.issuer.name}</p>
            {invoice.issuer.address && <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{invoice.issuer.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">Invoice</p>
            <p className="font-mono text-sm text-slate-600">{formatInvoiceNumber(invoice.number)}</p>
            <div className="mt-2"><Badge tone={INVOICE_STATUS[state].tone}>{INVOICE_STATUS[state].label}</Badge></div>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Bill to</p>
            <p className="mt-1 font-medium text-slate-900">{invoice.client_name}</p>
            {invoice.bill_to && <p className="whitespace-pre-line text-sm text-slate-600">{invoice.bill_to}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:justify-self-end">
            <dt className="text-slate-500">Issued</dt><dd className="text-right text-slate-900">{invoice.issue_date}</dd>
            <dt className="text-slate-500">Due</dt><dd className="text-right font-medium text-slate-900">{invoice.due_date}</dd>
            <dt className="text-slate-500">Service period</dt><dd className="text-right text-slate-900">{invoice.period_start} – {invoice.period_end}</dd>
            {invoice.paid_at && (<><dt className="text-slate-500">Paid</dt><dd className="text-right text-emerald-700">{formatDateTime(invoice.paid_at)}</dd></>)}
          </dl>
        </section>

        <div className="-mx-6 mt-8 overflow-x-auto sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.time_lines.map((l) => (
                <tr key={l.entry_id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{l.date}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {l.description}
                    <span className="block text-xs text-slate-400">
                      {l.tech_name}{l.minutes !== l.actual_minutes && ` · worked ${formatHours(l.actual_minutes * 60_000)} h`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(l.minutes * 60_000)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(l.rate_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(l.amount_cents)}</td>
                </tr>
              ))}
              {invoice.extra_lines.map((l, i) => (
                <tr key={`extra-${i}`} className="align-top">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-slate-800">{l.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(l.unit_price_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(l.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><dt>Labor ({formatHours(workedMinutes * 60_000)} h)</dt><dd className="tabular-nums">{money(invoice.time_lines.reduce((s, l) => s + l.amount_cents, 0))}</dd></div>
            {invoice.extra_lines.length > 0 && (
              <div className="flex justify-between text-slate-500"><dt>Other charges</dt><dd className="tabular-nums">{money(invoice.extra_lines.reduce((s, l) => s + l.amount_cents, 0))}</dd></div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-700"><dt>Subtotal</dt><dd className="tabular-nums">{money(invoice.subtotal_cents)}</dd></div>
            <div className="flex justify-between text-slate-700"><dt>Tax ({invoice.tax_rate_bp / 100}%)</dt><dd className="tabular-nums">{money(invoice.tax_cents)}</dd></div>
            <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-semibold text-slate-900"><dt>Total due</dt><dd className="tabular-nums">{money(invoice.total_cents)}</dd></div>
          </dl>
        </section>

        {(invoice.notes || invoice.issuer.payment_instructions) && (
          <section className="mt-8 grid gap-6 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">
            {invoice.issuer.payment_instructions && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">How to pay</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">{invoice.issuer.payment_instructions}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">{invoice.notes}</p>
              </div>
            )}
          </section>
        )}
        {invoice.status === "void" && <p className="mt-8 text-center text-sm font-medium uppercase tracking-widest text-red-600">Void · nothing is owed on this invoice</p>}
      </article>

      {editing && <EditDraft invoice={invoice} onClose={() => setEditing(false)} />}
    </div>
  );
}

interface ExtraRow {
  description: string;
  quantity: string;
  price: string;
}

function EditDraft({ invoice, onClose }: { invoice: InvoiceType; onClose: () => void }) {
  const [issueDate, setIssueDate] = useState(invoice.issue_date);
  const [dueDate, setDueDate] = useState(invoice.due_date);
  const [tax, setTax] = useState(String(invoice.tax_rate_bp / 100));
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [rows, setRows] = useState<ExtraRow[]>(
    invoice.extra_lines.map((l) => ({ description: l.description, quantity: String(l.quantity), price: (l.unit_price_cents / 100).toFixed(2) })),
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const extra = rows
    .filter((r) => r.description.trim())
    .map((r) => ({ description: r.description, quantity: Number(r.quantity) || 0, unit_price_cents: parseMoney(r.price) ?? 0 }));
  const totals = invoiceTotals(
    invoice.time_lines,
    extra.map((l) => ({ ...l, amount_cents: extraAmount(l.quantity, l.unit_price_cents) })),
    parsePercent(tax),
  );
  const setRow = (i: number, patch: Partial<ExtraRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    if (dueDate < issueDate) return setError(new Error("The due date can't be before the issue date"));
    setBusy(true);
    try {
      await InvoicesApi.editDraft(invoice, { issue_date: issueDate, due_date: dueDate, extra_lines: extra, tax_rate_bp: parsePercent(tax), notes });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Edit draft" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">Edit {formatInvoiceNumber(invoice.number)}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm"><span className="mb-1 block font-medium text-slate-700">Issue date</span><input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium text-slate-700">Due date</span><input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium text-slate-700">Tax rate (%)</span><input className={inputClass} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
        </div>

        <p className="mt-5 text-sm font-medium text-slate-700">Other charges</p>
        <p className="text-xs text-slate-400">Parts, licences, a flat fee… Time lines come from the shifts and can't be edited here.</p>
        <div className="mt-2 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input aria-label="Description" className={`${inputClass} col-span-12 sm:col-span-6`} placeholder="Description" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} />
              <input aria-label="Quantity" className={`${inputClass} col-span-3 sm:col-span-2`} inputMode="decimal" placeholder="Qty" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
              <input aria-label="Unit price" className={`${inputClass} col-span-6 sm:col-span-3`} inputMode="decimal" placeholder="Unit price" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
              <button type="button" aria-label="Remove line" className="col-span-3 text-sm text-red-600 sm:col-span-1" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className={buttonClass.link} onClick={() => setRows([...rows, { description: "", quantity: "1", price: "" }])}>+ Add a charge</button>
        </div>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notes for the client</span>
          <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <dl className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{formatMoney(totals.subtotal_cents, invoice.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="tabular-nums">{formatMoney(totals.tax_cents, invoice.currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(totals.total_cents, invoice.currency)}</dd></div>
        </dl>
        <ErrorNote error={error} />
        <div className="mt-4 flex justify-end gap-2">
          <button className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button className={buttonClass.primary} disabled={busy} onClick={save}>Save draft</button>
        </div>
      </div>
    </div>
  );
}
