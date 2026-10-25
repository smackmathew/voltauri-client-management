import { isoDay } from "../lib/format";
import type { Tone } from "../lib/labels";
import type { Invoice } from "../types";

export type InvoiceState = "draft" | "sent" | "overdue" | "paid" | "void";

export const INVOICE_STATUS: Record<InvoiceState, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  sent: { label: "Awaiting payment", tone: "blue" },
  overdue: { label: "Overdue", tone: "red" },
  paid: { label: "Paid", tone: "green" },
  void: { label: "Void", tone: "slate" },
};

/** The status as people talk about it: a sent invoice past its due date is overdue. */
export function invoiceState(invoice: Invoice, today = isoDay(new Date())): InvoiceState {
  if (invoice.status === "sent" && invoice.due_date < today) return "overdue";
  return invoice.status;
}
