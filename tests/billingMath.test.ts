import { describe, expect, it } from "vitest";
import { billableMinutes, buildTimeLines, invoiceTotals, parseMoney, parsePercent, rateFor } from "../src/lib/billing";
import type { TimeEntry } from "../src/types";

const MIN = 60_000;

function entry(id: string, start: string, minutes: number, fields: Partial<TimeEntry> = {}): TimeEntry {
  const clock_in = new Date(start);
  return {
    id,
    tech_id: "t",
    tech_name: "Terry",
    client_id: "c",
    client_name: "Acme",
    task_id: null,
    ticket_id: null,
    notes: "",
    clock_in,
    clock_out: new Date(clock_in.getTime() + minutes * MIN),
    edited_by: null,
    edited_at: null,
    edit_reason: null,
    original: null,
    invoice_id: null,
    ...fields,
  };
}

describe("billing math", () => {
  it("rounds each stretch up to the increment, with one increment minimum", () => {
    expect(billableMinutes(61 * MIN, 15)).toBe(75);
    expect(billableMinutes(60 * MIN, 15)).toBe(60);
    expect(billableMinutes(30 * 1000, 15)).toBe(15);
    expect(billableMinutes(7 * MIN, 6)).toBe(12);
    expect(billableMinutes(7.5 * MIN, 1)).toBe(8);
  });

  it("uses the client's rate, else the company default", () => {
    const settings = { default_rate_cents: 9500 } as Parameters<typeof rateFor>[1];
    expect(rateFor({ hourly_rate_cents: 12500 }, settings)).toBe(12500);
    expect(rateFor({ hourly_rate_cents: null }, settings)).toBe(9500);
  });

  it("builds one line per closed entry, oldest first, with amounts in cents", () => {
    const lines = buildTimeLines(
      [
        entry("b", "2026-10-02T09:00:00", 50, { notes: "Server patching" }),
        entry("a", "2026-10-01T09:00:00", 90),
        entry("open", "2026-10-03T09:00:00", 10, { clock_out: null }),
      ],
      12000,
      15,
    );
    expect(lines.map((l) => l.entry_id)).toEqual(["a", "b"]);
    expect(lines[0]).toMatchObject({ minutes: 90, actual_minutes: 90, amount_cents: 18000 });
    expect(lines[1]).toMatchObject({ minutes: 60, actual_minutes: 50, amount_cents: 12000, description: "Server patching" });
  });

  it("adds extra lines and tax", () => {
    const lines = buildTimeLines([entry("a", "2026-10-01T09:00:00", 60)], 10000, 15);
    const totals = invoiceTotals(lines, [{ description: "PSU", quantity: 1, unit_price_cents: 4999, amount_cents: 4999 }], 825);
    expect(totals).toEqual({ subtotal_cents: 14999, tax_cents: 1237, total_cents: 16236 });
  });

  it("parses money and percentages as typed", () => {
    expect(parseMoney("$1,250.50")).toBe(125050);
    expect(parseMoney("")).toBeNull();
    expect(parsePercent("8.25")).toBe(825);
  });
});
