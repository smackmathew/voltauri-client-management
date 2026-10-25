import type { BillingSettings, Client, ExtraLine, TimeEntry, TimeLine } from "../types";
import { isoDay } from "./format";

export const DEFAULT_BILLING: BillingSettings = {
  address: null,
  currency: "USD",
  default_rate_cents: 0,
  billing_increment_minutes: 15,
  default_tax_rate_bp: 0,
  payment_terms_days: 30,
  payment_instructions: null,
};

export const BILLING_INCREMENTS = [1, 6, 15, 30, 60];

/** Minutes billed for a stretch of work: rounded up to the billing increment, at least one increment. */
export function billableMinutes(ms: number, increment: number): number {
  const minutes = ms / 60_000;
  const step = Math.max(1, increment);
  return Math.max(step, Math.ceil(minutes / step - 1e-9) * step);
}

/** The client's own rate, or the company default. */
export function rateFor(client: Pick<Client, "hourly_rate_cents"> | null | undefined, settings: BillingSettings): number {
  return client?.hourly_rate_cents ?? settings.default_rate_cents;
}

export function lineAmount(minutes: number, rateCents: number): number {
  return Math.round((minutes * rateCents) / 60);
}

/** One invoice line per closed entry, oldest first. */
export function buildTimeLines(entries: TimeEntry[], rateCents: number, increment: number): TimeLine[] {
  return [...entries]
    .filter((e) => e.clock_out)
    .sort((a, b) => a.clock_in.getTime() - b.clock_in.getTime())
    .map((e) => {
      const actual = Math.round((e.clock_out!.getTime() - e.clock_in.getTime()) / 60_000);
      const minutes = billableMinutes(e.clock_out!.getTime() - e.clock_in.getTime(), increment);
      return {
        entry_id: e.id,
        date: isoDay(e.clock_in),
        tech_name: e.tech_name,
        description: e.notes || "On-site / remote support",
        actual_minutes: actual,
        minutes,
        rate_cents: rateCents,
        amount_cents: lineAmount(minutes, rateCents),
      };
    });
}

export function extraAmount(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export interface Totals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Tax is charged on the whole subtotal, in basis points (825 = 8.25%). */
export function invoiceTotals(timeLines: TimeLine[], extraLines: ExtraLine[], taxRateBp: number): Totals {
  const subtotal =
    timeLines.reduce((sum, l) => sum + l.amount_cents, 0) + extraLines.reduce((sum, l) => sum + l.amount_cents, 0);
  const tax = Math.round((subtotal * taxRateBp) / 10_000);
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

/** "125.50" -> 12550; blank or invalid -> null. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** "8.25" -> 825 basis points. */
export function parsePercent(text: string): number {
  const value = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? Math.min(10_000, Math.round(value * 100)) : 0;
}

export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(4, "0")}`;
}

