import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { loadOrganization, orgDoc, updateOrganization } from "../src/firebase/account";
import { db } from "../src/firebase/app";
import { ClientsApi, toClient } from "../src/firebase/clients";
import { fetchQuery } from "../src/firebase/data";
import { InvoicesApi, toInvoice } from "../src/firebase/invoices";
import { TimeApi, toEntry } from "../src/firebase/time";
import type { Client, Invoice, Profile, TimeEntry } from "../src/types";
import { seedOrganization, signInAs } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

const HOUR = 60 * 60 * 1000;
const PERIOD = { start: "2026-10-01", end: "2026-10-31" };

describe("billing and invoices", () => {
  let s: Seed;

  beforeAll(async () => {
    s = await seedOrganization();
    await signInAs(s.admin);
    await updateOrganization({ default_rate_cents: 10000, billing_increment_minutes: 15, default_tax_rate_bp: 0, payment_terms_days: 14 });
  });

  async function client(id: string): Promise<Client> {
    return toClient(await getDoc(ClientsApi.clientDoc(id)));
  }

  /** Admin-added finished shifts, `hours` long each, ending in the past. */
  async function shifts(admin: Profile, clientId: string, hours: number[]): Promise<TimeEntry[]> {
    const c = await client(clientId);
    const out: TimeEntry[] = [];
    let end = Date.now() - HOUR;
    for (const h of hours) {
      const id = await TimeApi.addManual(admin, s.tech.profile, { client: c, clock_in: new Date(end - h * HOUR), clock_out: new Date(end) }, "Seeded");
      out.push(toEntry(await getDoc(TimeApi.entryDoc(id))));
      end -= 2 * h * HOUR + HOUR;
    }
    return out;
  }

  async function invoice(id: string): Promise<Invoice> {
    return toInvoice(await getDoc(InvoicesApi.invoiceDoc(id)));
  }

  async function draft(admin: Profile, clientId: string, entries: TimeEntry[]): Promise<string> {
    const org = (await loadOrganization())!;
    return InvoicesApi.createDraft(admin, org, await client(clientId), entries, PERIOD);
  }

  it("invoices unbilled time at the client's rate, numbered in sequence", async () => {
    const admin = await signInAs(s.admin);
    const acme = await client(s.acme.id);
    await ClientsApi.update(acme.id, { ...acme, hourly_rate_cents: 15000 });

    const entries = await shifts(admin, s.acme.id, [1, 2.1]);
    const first = await invoice(await draft(admin, s.acme.id, entries));
    expect(first.number).toBe(1);
    expect(first.status).toBe("draft");
    // 1h and 2h06m -> 1h and 2h15m at $150/h.
    expect(first.time_lines.map((l) => l.minutes).sort()).toEqual([135, 60]);
    expect(first.total_cents).toBe(15000 + 33750);

    for (const e of entries) {
      expect(toEntry(await getDoc(TimeApi.entryDoc(e.id))).invoice_id).toBe(first.id);
    }

    const globexEntries = await shifts(admin, s.globex.id, [1]);
    const second = await invoice(await draft(admin, s.globex.id, globexEntries));
    expect(second.number).toBe(2);
    expect(second.total_cents).toBe(10000); // the company default rate
  });

  it("never bills the same time twice, and locks billed time", async () => {
    const admin = await signInAs(s.admin);
    const entries = await shifts(admin, s.acme.id, [1]);
    const id = await draft(admin, s.acme.id, entries);

    // Pretend the app's copy of the entry is stale, so only the rules stand in the way.
    await expect(draft(admin, s.acme.id, entries)).rejects.toThrow();
    const billed = toEntry(await getDoc(TimeApi.entryDoc(entries[0].id)));
    await expect(
      TimeApi.correct(admin, billed, { clock_in: billed.clock_in, clock_out: new Date(billed.clock_out!.getTime() - 60_000) }, "Too long"),
    ).rejects.toThrow();
    await expect(updateDoc(TimeApi.entryDoc(entries[0].id), { invoice_id: null })).rejects.toThrow();

    // Deleting the draft frees the time.
    await InvoicesApi.deleteDraft(await invoice(id));
    expect(toEntry(await getDoc(TimeApi.entryDoc(entries[0].id))).invoice_id).toBeNull();
    await TimeApi.correct(admin, billed, { clock_in: billed.clock_in, clock_out: new Date(billed.clock_out!.getTime() - 60_000) }, "Too long");
  });

  it("won't bill open shifts or another client's time", async () => {
    const admin = await signInAs(s.admin);
    const globexEntries = await shifts(admin, s.globex.id, [1]);
    const acme = await client(s.acme.id);
    const org = (await loadOrganization())!;
    // Relabel Globex time as Acme's to get past the app's own check.
    const disguised = globexEntries.map((e) => ({ ...e, client_id: acme.id }));
    await expect(InvoicesApi.createDraft(admin, org, acme, disguised, PERIOD)).rejects.toThrow();

    const tech = await signInAs(s.tech);
    const openId = await TimeApi.clockIn(tech, { client: s.acme });
    const open = toEntry(await getDoc(TimeApi.entryDoc(openId)));
    const adminAgain = await signInAs(s.admin);
    await expect(
      InvoicesApi.createDraft(adminAgain, (await loadOrganization())!, acme, [{ ...open, clock_out: new Date() }], PERIOD),
    ).rejects.toThrow();
    await TimeApi.clockOut(await signInAs(s.tech), "");
  });

  it("rejects an invoice whose totals don't add up, or with a reused number", async () => {
    const admin = await signInAs(s.admin);
    const org = (await loadOrganization())!;
    const base = {
      number: org.next_invoice_number,
      client_id: s.acme.id,
      client_name: "Acme Corp",
      bill_to: null,
      issuer: { name: "Tauri", address: null, payment_instructions: null },
      currency: "USD",
      status: "draft",
      period_start: PERIOD.start,
      period_end: PERIOD.end,
      issue_date: "2026-11-01",
      due_date: "2026-11-15",
      entry_ids: [],
      time_lines: [],
      extra_lines: [],
      tax_rate_bp: 0,
      subtotal_cents: 100,
      tax_cents: 0,
      total_cents: 999,
      notes: null,
      created_by: admin.id,
      created_at: serverTimestamp() as unknown as Date,
      sent_at: null,
      paid_at: null,
      voided_at: null,
    };
    // A complete batch (counter advanced too), so the totals and the number are the only problems.
    const create = (id: string, fields: Partial<typeof base>) => {
      const batch = writeBatch(db);
      batch.set(doc(db, "invoices", id), { ...base, ...fields });
      batch.update(orgDoc(), { next_invoice_number: org.next_invoice_number + 1 });
      return batch.commit();
    };
    await expect(create("bad-total", {})).rejects.toThrow();
    await expect(create("reused", { number: 1, total_cents: 100 })).rejects.toThrow();
    await create("good", { total_cents: 100 });
    await InvoicesApi.deleteDraft(await invoice("good"));
  });

  it("shows clients their invoices once sent, never drafts or other clients'", async () => {
    const admin = await signInAs(s.admin);
    const entries = await shifts(admin, s.acme.id, [3]);
    const id = await draft(admin, s.acme.id, entries);

    let acmeUser = await signInAs(s.acmeUser);
    await expect(getDoc(InvoicesApi.invoiceDoc(id))).rejects.toThrow();
    let visible = await fetchQuery(InvoicesApi.visibleQuery(acmeUser), toInvoice);
    expect(visible.some((i) => i.id === id)).toBe(false);

    await signInAs(s.admin);
    const current = await invoice(id);
    await InvoicesApi.editDraft(current, {
      issue_date: current.issue_date,
      due_date: current.due_date,
      extra_lines: [{ description: "Replacement PSU", quantity: 1, unit_price_cents: 8900 }],
      tax_rate_bp: 1000,
      notes: "Thanks!",
    });
    const edited = await invoice(id);
    // 3h at Acme's $150/h, plus the part, plus 10% tax.
    expect(edited.subtotal_cents).toBe(45000 + 8900);
    expect(edited.tax_cents).toBe(5390);
    await InvoicesApi.markSent(edited);

    acmeUser = await signInAs(s.acmeUser);
    visible = await fetchQuery(InvoicesApi.visibleQuery(acmeUser), toInvoice);
    expect(visible.find((i) => i.id === id)?.total_cents).toBe(59290);
    await expect(InvoicesApi.markPaid(edited)).rejects.toThrow();

    const globexUser = await signInAs(s.globexUser);
    await expect(getDoc(InvoicesApi.invoiceDoc(id))).rejects.toThrow();
    expect((await fetchQuery(InvoicesApi.visibleQuery(globexUser), toInvoice)).every((i) => i.client_id === s.globex.id)).toBe(true);

    const tech = await signInAs(s.tech);
    await expect(fetchQuery(InvoicesApi.visibleQuery(tech), toInvoice)).rejects.toThrow();
  });

  it("freezes a sent invoice, then pays or voids it", async () => {
    const admin = await signInAs(s.admin);
    const entries = await shifts(admin, s.acme.id, [1]);
    const id = await draft(admin, s.acme.id, entries);
    await InvoicesApi.markSent(await invoice(id));

    const sent = await invoice(id);
    await expect(InvoicesApi.editDraft(sent, { ...sent, extra_lines: [], tax_rate_bp: 0 })).rejects.toThrow();
    await expect(InvoicesApi.deleteDraft(sent)).rejects.toThrow();
    await expect(deleteDoc(InvoicesApi.invoiceDoc(id))).rejects.toThrow();

    await InvoicesApi.markPaid(sent);
    expect((await invoice(id)).paid_at).not.toBeNull();
    await expect(InvoicesApi.void(await invoice(id))).rejects.toThrow(); // mark unpaid first
    await InvoicesApi.markUnpaid(await invoice(id));
    await InvoicesApi.void(await invoice(id));
    expect((await invoice(id)).status).toBe("void");
    expect(toEntry(await getDoc(TimeApi.entryDoc(entries[0].id))).invoice_id).toBeNull();
  });

  it("bills a long period's worth of entries in one batch", async () => {
    const admin = await signInAs(s.admin);
    const entries = await shifts(admin, s.globex.id, Array.from({ length: 40 }, () => 0.25));
    const created = await invoice(await draft(admin, s.globex.id, entries));
    expect(created.time_lines).toHaveLength(40);
    expect(created.total_cents).toBe(40 * 2500);
  });

  it("only lets admins change billing settings", async () => {
    await signInAs(s.tech);
    await expect(updateOrganization({ default_rate_cents: 1 })).rejects.toThrow();
    await signInAs(s.admin);
    await expect(updateOrganization({ billing_increment_minutes: 7 })).rejects.toThrow();
    await expect(updateOrganization({ currency: "dollars" })).rejects.toThrow();
    await updateOrganization({ currency: "CAD", payment_instructions: "e-Transfer to billing@tauri.example" });
    expect((await loadOrganization())?.currency).toBe("CAD");
  });
});
