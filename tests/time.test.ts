import { deleteDoc, doc, getDoc, serverTimestamp, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/firebase/app";
import { fetchQuery, watchQuery } from "../src/firebase/data";
import { entryDuration, TimeApi, toEntry } from "../src/firebase/time";
import type { TimeEntry } from "../src/types";
import { seedOrganization, signInAs, sleep } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

const DAY = 24 * 60 * 60 * 1000;
const around = () => [new Date(Date.now() - DAY), new Date(Date.now() + DAY)] as const;

describe("time clock", () => {
  let s: Seed;

  beforeAll(async () => {
    s = await seedOrganization();
  });

  it("clocks a tech in and out with server-stamped times", async () => {
    const tech = await signInAs(s.tech);
    const before = Date.now();
    const id = await TimeApi.clockIn(tech, { client: s.acme, notes: "Printer" });

    const me = await signInAs(s.tech);
    expect(me.active_entry_id).toBe(id);
    let entry = toEntry(await getDoc(TimeApi.entryDoc(id)));
    expect(entry.clock_out).toBeNull();
    expect(Math.abs(entry.clock_in.getTime() - before)).toBeLessThan(10_000);

    await sleep(50);
    await TimeApi.clockOut(me, "Replaced toner");
    expect((await signInAs(s.tech)).active_entry_id).toBeNull();
    entry = toEntry(await getDoc(TimeApi.entryDoc(id)));
    expect(entry.clock_out).not.toBeNull();
    expect(entry.notes).toBe("Replaced toner");
    expect(entryDuration(entry)).toBeGreaterThan(0);
  });

  it("lets a tech look up a shift the server hasn't saved yet", async () => {
    // Their screen starts listening to a new shift as soon as they clock in, which can be
    // before the server has it; that read must not be refused.
    await signInAs(s.tech);
    expect((await getDoc(TimeApi.entryDoc("not-saved-yet"))).exists()).toBe(false);
  });

  it("allows only one open shift per tech", async () => {
    const tech = await signInAs(s.tech);
    await TimeApi.clockIn(tech, { client: s.acme });
    // Pretend the app's copy of the profile is stale, so only the rules stand in the way.
    await expect(TimeApi.clockIn({ ...tech, active_entry_id: null }, { client: s.globex })).rejects.toThrow();
    await TimeApi.clockOut(await signInAs(s.tech), "");
  });

  it("rejects a tech typing in their own times", async () => {
    const tech = await signInAs(s.tech);
    const ref = doc(db, "time_entries", "backdated");
    const batch = writeBatch(db);
    batch.set(ref, {
      tech_id: tech.id,
      tech_name: tech.full_name,
      client_id: s.acme.id,
      client_name: s.acme.name,
      task_id: null,
      ticket_id: null,
      notes: "",
      clock_in: Timestamp.fromMillis(Date.now() - 8 * 60 * 60 * 1000),
      clock_out: null,
      edited_by: null,
      edited_at: null,
      edit_reason: null,
      original: null,
      created_by: tech.id,
      created_at: serverTimestamp(),
    });
    batch.update(doc(db, "users", tech.id), { active_entry_id: "backdated" });
    await expect(batch.commit()).rejects.toThrow();

    const id = await TimeApi.clockIn(tech, { client: s.acme });
    await expect(updateDoc(TimeApi.entryDoc(id), { clock_in: Timestamp.fromMillis(Date.now() - DAY) })).rejects.toThrow();
    await TimeApi.updateNotes(id, "Notes while working are fine");
    await TimeApi.clockOut(await signInAs(s.tech), "");
    // Closed entries are final for the tech, and nobody deletes entries.
    await expect(updateDoc(TimeApi.entryDoc(id), { notes: "rewrite" })).rejects.toThrow();
    await expect(deleteDoc(TimeApi.entryDoc(id))).rejects.toThrow();
    await signInAs(s.admin);
    await expect(deleteDoc(TimeApi.entryDoc(id))).rejects.toThrow();
  });

  it("shows each tech only their own time, and admins everyone's", async () => {
    const other = await signInAs(s.otherTech);
    await TimeApi.clockIn(other, { client: s.globex });

    const tech = await signInAs(s.tech);
    const mine = await fetchQuery(TimeApi.rangeQuery(tech, ...around()), toEntry);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.tech_id === tech.id)).toBe(true);

    const admin = await signInAs(s.admin);
    const open = await fetchQuery(TimeApi.openQuery(admin), toEntry);
    expect(open.map((e) => e.tech_name)).toEqual(["Sam Second"]);
  });

  it("shows a client their own time, live, and nobody else's", async () => {
    const acmeUser = await signInAs(s.acmeUser);
    const rows = await fetchQuery(TimeApi.rangeQuery(acmeUser, ...around()), toEntry);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((e) => e.client_id === s.acme.id)).toBe(true);

    // Globex's tech is on the clock, but Acme sees no one working for them.
    let live: TimeEntry[] | null = null;
    const stop = watchQuery(TimeApi.openQuery(acmeUser), toEntry, (r) => (live = r), (e) => { throw e; });
    await waitFor(() => live !== null);
    expect(live).toEqual([]);
    stop();

    const globexUser = await signInAs(s.globexUser);
    const globexLive = await fetchQuery(TimeApi.openQuery(globexUser), toEntry);
    expect(globexLive.map((e) => e.tech_name)).toEqual(["Sam Second"]);
  });

  it("lets an admin correct an entry, with a reason, keeping the original punch", async () => {
    const tech = await signInAs(s.tech);
    const id = await TimeApi.clockIn(tech, { client: s.acme });
    await TimeApi.clockOut(await signInAs(s.tech), "");

    const admin = await signInAs(s.admin);
    const entry = toEntry(await getDoc(TimeApi.entryDoc(id)));
    const clockIn = new Date(entry.clock_in.getTime() - 60 * 60 * 1000);
    await expect(TimeApi.correct(admin, entry, { clock_in: clockIn, clock_out: entry.clock_out }, "  ")).rejects.toThrow();
    await TimeApi.correct(admin, entry, { clock_in: clockIn, clock_out: entry.clock_out }, "Forgot to clock in");

    const corrected = toEntry(await getDoc(TimeApi.entryDoc(id)));
    expect(corrected.clock_in.getTime()).toBe(clockIn.getTime());
    expect(corrected.edit_reason).toBe("Forgot to clock in");
    expect(corrected.edited_by).toBe(admin.id);
    expect(corrected.original?.clock_in.getTime()).toBe(entry.clock_in.getTime());

    // A second correction keeps the first original.
    await TimeApi.correct(admin, corrected, { clock_in: clockIn, clock_out: new Date(clockIn.getTime() + 30 * 60 * 1000) }, "Left early");
    const again = toEntry(await getDoc(TimeApi.entryDoc(id)));
    expect(again.original?.clock_in.getTime()).toBe(entry.clock_in.getTime());
    expect(again.edit_reason).toBe("Left early");

    // Techs can't correct, even their own entry.
    const techAgain = await signInAs(s.tech);
    await expect(TimeApi.correct(techAgain, again, { clock_in: clockIn, clock_out: null }, "mine")).rejects.toThrow();
  });

  it("lets an admin clock out a tech who forgot, so they can clock in again", async () => {
    const tech = await signInAs(s.tech);
    const id = await TimeApi.clockIn(tech, { client: s.acme });

    const admin = await signInAs(s.admin);
    const entry = toEntry(await getDoc(TimeApi.entryDoc(id)));
    await TimeApi.correct(admin, entry, { clock_in: entry.clock_in, clock_out: new Date() }, "Forgot to clock out");

    const after = await signInAs(s.tech);
    expect(after.active_entry_id).toBeNull();
    await TimeApi.clockIn(after, { client: s.acme });
    await TimeApi.clockOut(await signInAs(s.tech), "");
  });

  it("lets an admin add a missed shift, marked as edited", async () => {
    const admin = await signInAs(s.admin);
    const start = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const end = new Date(Date.now() - 60 * 60 * 1000);
    const id = await TimeApi.addManual(admin, s.tech.profile, { client: s.globex, clock_in: start, clock_out: end }, "Paper timesheet");
    const entry = toEntry(await getDoc(TimeApi.entryDoc(id)));
    expect(entryDuration(entry)).toBe(2 * 60 * 60 * 1000);
    expect(entry.edit_reason).toBe("Paper timesheet");

    await expect(
      TimeApi.addManual(admin, s.tech.profile, { client: s.globex, clock_in: end, clock_out: start }, "Backwards"),
    ).rejects.toThrow();
    const tech = await signInAs(s.tech);
    await expect(
      TimeApi.addManual(tech, tech, { client: s.globex, clock_in: start, clock_out: end }, "Trust me"),
    ).rejects.toThrow();
  });
});

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i += 1) await sleep(50);
  expect(condition()).toBe(true);
}
