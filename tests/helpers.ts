import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../src/firebase/app";
import { AccountApi, loadProfile } from "../src/firebase/account";
import { ClientsApi } from "../src/firebase/clients";
import { TeamApi } from "../src/firebase/team";
import type { Client, Profile, Role } from "../src/types";

const PROJECT = "demo-tauri";
const PASSWORD = "password123";

export interface TestUser {
  email: string;
  profile: Profile;
}

/** Wipes the emulators so each test file starts with no organization, users or data. */
export async function resetEmulators(): Promise<void> {
  await signOut(auth);
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

let counter = 0;

export function newEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}${Date.now()}-${counter}@example.com`;
}

/** Signs in as `user` and returns their current profile. */
export async function signInAs(user: TestUser): Promise<Profile> {
  await signInWithEmailAndPassword(auth, user.email, PASSWORD);
  const profile = (await loadProfile(auth.currentUser!.uid))!;
  user.profile = profile;
  return profile;
}

export async function signUpFounder(fullName = "Olivia Owner"): Promise<TestUser> {
  const email = newEmail("owner");
  const profile = await AccountApi.signup({ full_name: fullName, email, password: PASSWORD, org_name: "Tauri" });
  return { email, profile };
}

/** As `admin`, invites someone with `role`, then signs them up with the code. Leaves them signed in. */
export async function inviteAndJoin(admin: TestUser, role: Role, clientId: string | null, fullName = role): Promise<TestUser> {
  await signInAs(admin);
  const code = await TeamApi.createInvite({ role, client_id: clientId }, admin.profile.id);
  await signOut(auth);
  const email = newEmail(role);
  const profile = await AccountApi.signup({ full_name: fullName, email, password: PASSWORD, invite_code: code });
  return { email, profile };
}

/** As `admin`, creates a client company. Leaves the admin signed in. */
export async function createClient(admin: TestUser, name: string): Promise<Pick<Client, "id" | "name">> {
  await signInAs(admin);
  const id = await ClientsApi.create({
    name,
    contact_name: null,
    email: null,
    phone: null,
    address: null,
    notes: null,
    active: true,
    hourly_rate_cents: null,
  });
  return { id, name };
}

/** A typical setup: an admin, two techs, two client companies with one user each. */
export async function seedOrganization() {
  await resetEmulators();
  const admin = await signUpFounder();
  const acme = await createClient(admin, "Acme Corp");
  const globex = await createClient(admin, "Globex");
  const tech = await inviteAndJoin(admin, "tech", null, "Terry Tech");
  const otherTech = await inviteAndJoin(admin, "tech", null, "Sam Second");
  const acmeUser = await inviteAndJoin(admin, "client", acme.id, "Ann Acme");
  const globexUser = await inviteAndJoin(admin, "client", globex.id, "Gus Globex");
  return { admin, tech, otherTech, acme, globex, acmeUser, globexUser };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
