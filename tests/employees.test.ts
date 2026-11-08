import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { loadProfile } from "../src/firebase/account";
import { db } from "../src/firebase/app";
import { fetchQuery } from "../src/firebase/data";
import { TeamApi } from "../src/firebase/team";
import type { Profile } from "../src/types";
import { seedOrganization, signInAs } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

describe("editing employees", () => {
  let s: Seed;

  beforeAll(async () => {
    s = await seedOrganization();
  });

  const details = (p: Profile) => ({
    full_name: p.full_name,
    role: p.role,
    client_id: p.client_id,
    active: p.active,
    phone: p.phone,
    job_title: p.job_title,
    start_date: p.start_date,
  });

  it("lets an admin edit an employee's contact and job details", async () => {
    const admin = await signInAs(s.admin);
    const tech = s.tech.profile;
    await TeamApi.saveEmployee(admin, tech, { ...details(tech), phone: " 555-0100 ", job_title: "Field technician", start_date: "2026-03-02" }, null);

    const saved = (await loadProfile(tech.id))!;
    expect(saved).toMatchObject({ phone: "555-0100", job_title: "Field technician", start_date: "2026-03-02" });

    await expect(TeamApi.saveEmployee(admin, tech, { ...details(saved), start_date: "March 2nd" }, null)).rejects.toThrow();
    // Other staff can see contact details; client users can't see staff profiles at all.
    await signInAs(s.otherTech);
    expect((await loadProfile(tech.id))?.phone).toBe("555-0100");
    await signInAs(s.acmeUser);
    await expect(loadProfile(tech.id)).rejects.toThrow();
  });

  it("keeps pay and notes private to admins", async () => {
    const admin = await signInAs(s.admin);
    const tech = (await loadProfile(s.tech.profile.id))!;
    await TeamApi.saveEmployee(admin, tech, details(tech), { pay_rate_cents: 4250, notes: "CompTIA A+; emergency contact: Jo, 555-0199" });

    const stored = TeamApi.toPrivate(await getDoc(TeamApi.privateDoc(tech.id)));
    expect(stored).toEqual({ pay_rate_cents: 4250, notes: "CompTIA A+; emergency contact: Jo, 555-0199" });
    expect(await fetchQuery(TeamApi.privateQuery(), TeamApi.toPrivate)).toHaveLength(1);

    // The tech can't read their own record or anyone else's, or write one.
    await signInAs(s.tech);
    await expect(getDoc(TeamApi.privateDoc(tech.id))).rejects.toThrow();
    await expect(fetchQuery(TeamApi.privateQuery(), TeamApi.toPrivate)).rejects.toThrow();
    await expect(
      setDoc(TeamApi.privateDoc(tech.id), { pay_rate_cents: 99999, notes: null, updated_by: tech.id, updated_at: new Date() }),
    ).rejects.toThrow();
    await signInAs(s.acmeUser);
    await expect(getDoc(TeamApi.privateDoc(tech.id))).rejects.toThrow();
  });

  it("doesn't keep private details for client users", async () => {
    const admin = await signInAs(s.admin);
    const client = s.acmeUser.profile;
    await expect(
      setDoc(TeamApi.privateDoc(client.id), { pay_rate_cents: 100, notes: null, updated_by: admin.id, updated_at: new Date() }),
    ).rejects.toThrow();
    // Saving a client user's contact details skips the private record.
    await TeamApi.saveEmployee(admin, client, { ...details(client), phone: "555-0123" }, { pay_rate_cents: 100, notes: "x" });
    expect((await getDoc(TeamApi.privateDoc(client.id))).exists()).toBe(false);
  });

  it("lets an admin edit their own profile but not give up admin", async () => {
    const admin = await signInAs(s.admin);
    await TeamApi.saveEmployee(admin, admin, { ...details(admin), full_name: "Olivia O.", job_title: "Owner" }, { pay_rate_cents: null, notes: null });
    expect((await loadProfile(admin.id))?.job_title).toBe("Owner");
    const me = (await loadProfile(admin.id))!;
    await expect(TeamApi.saveEmployee(me, me, { ...details(me), role: "tech" }, null)).rejects.toThrow();
    await expect(TeamApi.saveEmployee(me, me, { ...details(me), active: false }, null)).rejects.toThrow();
  });

  it("doesn't let staff edit each other's details", async () => {
    const tech = await signInAs(s.tech);
    await expect(updateDoc(doc(db, "users", s.otherTech.profile.id), { phone: "1" })).rejects.toThrow();
    await expect(updateDoc(doc(db, "users", tech.id), { job_title: "CEO" })).rejects.toThrow();
  });
});
