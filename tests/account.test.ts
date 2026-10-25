import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { auth, db } from "../src/firebase/app";
import { AccountApi, foundOrganization, loadOrganization } from "../src/firebase/account";
import { fetchQuery } from "../src/firebase/data";
import { TeamApi } from "../src/firebase/team";
import { createClient, newEmail, resetEmulators, signInAs, signUpFounder, type TestUser } from "./helpers";

describe("accounts and invites", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    admin = await signUpFounder();
  });

  it("makes the first account the organization's admin", async () => {
    expect(admin.profile.role).toBe("admin");
    expect(admin.profile.client_id).toBeNull();
    expect((await loadOrganization())?.owner_id).toBe(admin.profile.id);
  });

  it("lets nobody else found the organization", async () => {
    await signOut(auth);
    await expect(
      AccountApi.signup({ full_name: "Mallory", email: newEmail(), password: "password123", org_name: "Mine" }),
    ).rejects.toThrow(/already set up/);
    // The account exists but has no profile, so it can see nothing.
    await expect(getDoc(doc(db, "clients", "anything"))).rejects.toThrow();
  });

  it("joins a tech with an invite code, once", async () => {
    await signInAs(admin);
    const code = await TeamApi.createInvite({ role: "tech", client_id: null }, admin.profile.id);
    await signOut(auth);

    const tech = await AccountApi.signup({ full_name: "Terry", email: newEmail(), password: "password123", invite_code: code });
    expect(tech.role).toBe("tech");

    await signOut(auth);
    await expect(
      AccountApi.signup({ full_name: "Again", email: newEmail(), password: "password123", invite_code: code }),
    ).rejects.toThrow(/Invalid or already-used/);
  });

  it("joins a client user to the client the invite names", async () => {
    const acme = await createClient(admin, "Acme");
    const code = await TeamApi.createInvite({ role: "client", client_id: acme.id }, admin.profile.id);
    await signOut(auth);

    const user = await AccountApi.signup({ full_name: "Ann", email: newEmail(), password: "password123", invite_code: code });
    expect(user.role).toBe("client");
    expect(user.client_id).toBe(acme.id);
  });

  it("holds an invite for the email it was issued to", async () => {
    await signInAs(admin);
    const code = await TeamApi.createInvite({ role: "tech", client_id: null, email: "Named@Example.com" }, admin.profile.id);
    await signOut(auth);

    await expect(
      AccountApi.signup({ full_name: "Wrong", email: newEmail(), password: "password123", invite_code: code }),
    ).rejects.toThrow();
    await signOut(auth);
    const named = await AccountApi.signup({ full_name: "Named", email: "named@example.com", password: "password123", invite_code: code });
    expect(named.role).toBe("tech");
  });

  it("rejects a self-made admin profile without an invite", async () => {
    await signOut(auth);
    await AccountApi.signup({ full_name: "Sneaky", email: newEmail(), password: "password123", invite_code: "NOPE" }).catch(() => {});
    const user = auth.currentUser!;
    await expect(
      setDoc(doc(db, "users", user.uid), {
        full_name: "Sneaky",
        email: user.email,
        role: "admin",
        client_id: null,
        active: true,
        active_entry_id: null,
        invite_code: null,
        created_at: new Date(),
      }),
    ).rejects.toThrow();
    await expect(foundOrganization("Sneaky", "Mine")).rejects.toThrow();
  });

  it("doesn't let a tech promote themselves", async () => {
    await signInAs(admin);
    const code = await TeamApi.createInvite({ role: "tech", client_id: null }, admin.profile.id);
    await signOut(auth);
    const tech = await AccountApi.signup({ full_name: "Terry", email: newEmail(), password: "password123", invite_code: code });

    await expect(updateDoc(doc(db, "users", tech.id), { role: "admin" })).rejects.toThrow();
    await expect(fetchQuery(TeamApi.pendingInvitesQuery(), (s) => s.id)).rejects.toThrow();
    await updateDoc(doc(db, "users", tech.id), { full_name: "Terry T." });
  });

  it("lets an admin deactivate others but not lock themselves out", async () => {
    await signInAs(admin);
    const code = await TeamApi.createInvite({ role: "tech", client_id: null }, admin.profile.id);
    await signOut(auth);
    const email = newEmail();
    const tech = await AccountApi.signup({ full_name: "Leaving", email, password: "password123", invite_code: code });

    await signInAs(admin);
    await TeamApi.updatePerson(tech.id, { active: false });
    await expect(TeamApi.updatePerson(admin.profile.id, { role: "tech" })).rejects.toThrow();
    await expect(TeamApi.updatePerson(admin.profile.id, { active: false })).rejects.toThrow();

    // A deactivated account sees nothing.
    await signInAs({ email, profile: tech });
    await expect(fetchQuery(TeamApi.peopleQuery(), (s) => s.id)).rejects.toThrow();
  });
});
