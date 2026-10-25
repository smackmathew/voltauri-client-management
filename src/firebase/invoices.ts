import {
  collection,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Query,
} from "firebase/firestore";
import { buildTimeLines, extraAmount, invoiceTotals, rateFor } from "../lib/billing";
import { addDays, isoDay } from "../lib/format";
import type { Client, ExtraLine, Invoice, Organization, Profile, TimeEntry } from "../types";
import { orgDoc } from "./account";
import { db } from "./app";
import { commit, snapshotData, textOrNull, toDate, toDateOrNull, type Mapper } from "./data";

/** Firestore allows 500 writes per batch; an invoice takes one per entry plus two. */
export const MAX_ENTRIES_PER_INVOICE = 400;

export const toInvoice: Mapper<Invoice> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    number: data.number,
    client_id: data.client_id,
    client_name: data.client_name,
    bill_to: data.bill_to ?? null,
    issuer: data.issuer,
    currency: data.currency,
    status: data.status,
    period_start: data.period_start,
    period_end: data.period_end,
    issue_date: data.issue_date,
    due_date: data.due_date,
    entry_ids: data.entry_ids ?? [],
    time_lines: data.time_lines ?? [],
    extra_lines: data.extra_lines ?? [],
    tax_rate_bp: data.tax_rate_bp,
    subtotal_cents: data.subtotal_cents,
    tax_cents: data.tax_cents,
    total_cents: data.total_cents,
    notes: data.notes ?? null,
    created_at: toDate(data.created_at),
    sent_at: toDateOrNull(data.sent_at),
    paid_at: toDateOrNull(data.paid_at),
    voided_at: toDateOrNull(data.voided_at),
  };
};

const invoices = () => collection(db, "invoices");
const entryDoc = (id: string) => doc(db, "time_entries", id);

function billTo(client: Client): string | null {
  return textOrNull([client.contact_name, client.address, client.email, client.phone].filter(Boolean).join("\n"));
}

export interface DraftEdits {
  issue_date: string;
  due_date: string;
  extra_lines: Omit<ExtraLine, "amount_cents">[];
  tax_rate_bp: number;
  notes: string | null;
}

export const InvoicesApi = {
  /** Admins see every invoice; a client user sees their company's once sent. */
  visibleQuery: (viewer: Profile): Query =>
    viewer.role === "client"
      ? query(invoices(), where("client_id", "==", viewer.client_id), where("status", "in", ["sent", "paid", "void"]))
      : invoices(),

  invoiceDoc: (id: string) => doc(invoices(), id),

  /**
   * Creates a draft invoice billing `entries` (closed, unbilled, all for `client`) at the
   * client's rate, and marks each entry as billed. Resolves to the new invoice's id.
   */
  createDraft: async (
    admin: Profile,
    org: Organization,
    client: Client,
    entries: TimeEntry[],
    period: { start: string; end: string },
  ): Promise<string> => {
    if (entries.length === 0) throw new Error("There's no unbilled time to invoice");
    if (entries.length > MAX_ENTRIES_PER_INVOICE) {
      throw new Error(`An invoice can hold up to ${MAX_ENTRIES_PER_INVOICE} entries; choose a shorter period`);
    }
    if (entries.some((e) => !e.clock_out || e.invoice_id || e.client_id !== client.id)) {
      throw new Error("Only finished, unbilled time for this client can be invoiced");
    }
    const timeLines = buildTimeLines(entries, rateFor(client, org), org.billing_increment_minutes);
    const totals = invoiceTotals(timeLines, [], org.default_tax_rate_bp);
    const today = new Date();
    const ref = doc(invoices());
    const batch = writeBatch(db);
    batch.set(ref, {
      number: org.next_invoice_number,
      client_id: client.id,
      client_name: client.name,
      bill_to: billTo(client),
      issuer: { name: org.name, address: org.address, payment_instructions: org.payment_instructions },
      currency: org.currency,
      status: "draft",
      period_start: period.start,
      period_end: period.end,
      issue_date: isoDay(today),
      due_date: isoDay(addDays(today, org.payment_terms_days)),
      entry_ids: timeLines.map((l) => l.entry_id),
      time_lines: timeLines,
      extra_lines: [],
      tax_rate_bp: org.default_tax_rate_bp,
      ...totals,
      notes: null,
      created_by: admin.id,
      created_at: serverTimestamp(),
      sent_at: null,
      paid_at: null,
      voided_at: null,
    });
    batch.update(orgDoc(), { next_invoice_number: org.next_invoice_number + 1 });
    for (const line of timeLines) batch.update(entryDoc(line.entry_id), { invoice_id: ref.id });
    try {
      await commit(batch);
    } catch (error) {
      if ((error as { code?: string }).code === "permission-denied") {
        throw new Error("Couldn't create the invoice. Someone may have just billed some of this time or taken this invoice number; refresh and try again.");
      }
      throw error;
    }
    return ref.id;
  },

  /** Changes a draft's dates, extra lines, tax and notes, recomputing the totals. */
  editDraft: (invoice: Invoice, edits: DraftEdits) => {
    const extraLines: ExtraLine[] = edits.extra_lines.map((l) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      amount_cents: extraAmount(l.quantity, l.unit_price_cents),
    }));
    return updateDoc(doc(invoices(), invoice.id), {
      issue_date: edits.issue_date,
      due_date: edits.due_date,
      extra_lines: extraLines,
      tax_rate_bp: edits.tax_rate_bp,
      ...invoiceTotals(invoice.time_lines, extraLines, edits.tax_rate_bp),
      notes: textOrNull(edits.notes),
    });
  },

  /** Sends the invoice: from now on the client sees it, and its lines are final. */
  markSent: (invoice: Invoice) => updateDoc(doc(invoices(), invoice.id), { status: "sent", sent_at: serverTimestamp() }),

  markPaid: (invoice: Invoice) => updateDoc(doc(invoices(), invoice.id), { status: "paid", paid_at: serverTimestamp() }),

  markUnpaid: (invoice: Invoice) => updateDoc(doc(invoices(), invoice.id), { status: "sent", paid_at: null }),

  /** Voids a sent invoice and frees its time to be billed again. */
  void: async (invoice: Invoice) => {
    const batch = writeBatch(db);
    batch.update(doc(invoices(), invoice.id), { status: "void", voided_at: serverTimestamp() });
    for (const id of invoice.entry_ids) batch.update(entryDoc(id), { invoice_id: null });
    await commit(batch);
  },

  /** Deletes a draft and frees its time. */
  deleteDraft: async (invoice: Invoice) => {
    const batch = writeBatch(db);
    batch.delete(doc(invoices(), invoice.id));
    for (const id of invoice.entry_ids) batch.update(entryDoc(id), { invoice_id: null });
    await commit(batch);
  },
};
