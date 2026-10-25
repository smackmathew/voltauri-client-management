import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch, type DocumentSnapshot } from "firebase/firestore";
import type { Organization, Profile } from "../types";
import { auth, db } from "./app";
import { commit, snapshotData } from "./data";

export class AuthError extends Error {}

function friendlyError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return new AuthError("Incorrect email or password");
    case "auth/email-already-in-use":
      return new AuthError("Email already registered");
    case "auth/weak-password":
      return new AuthError("Password must be at least 8 characters");
    case "auth/admin-restricted-operation":
      return new AuthError("Sign-up is turned off for this app");
    case "permission-denied":
      return new AuthError("That didn't work. Check the invite code, or ask an admin for a new one.");
    default:
      return error instanceof Error ? error : new Error(String(error));
  }
}

export function toProfile(snap: DocumentSnapshot): Profile {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    client_id: data.client_id ?? null,
    active: data.active === true,
    active_entry_id: data.active_entry_id ?? null,
  };
}

export function profileDoc(uid: string) {
  return doc(db, "users", uid);
}

export const orgDoc = () => doc(db, "config", "org");

/** The signed-in user's profile, or null if they haven't joined yet. */
export async function loadProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(profileDoc(uid));
  return snap.exists() ? toProfile(snap) : null;
}

export async function loadOrganization(): Promise<Organization | null> {
  const snap = await getDoc(orgDoc());
  return snap.exists() ? { name: snap.data().name, owner_id: snap.data().owner_id } : null;
}

function currentUser(): FirebaseUser {
  if (!auth.currentUser) throw new AuthError("Not signed in");
  return auth.currentUser;
}

function newProfile(user: FirebaseUser, fullName: string) {
  return {
    full_name: fullName.trim(),
    email: user.email ?? "",
    active: true,
    active_entry_id: null,
    created_at: serverTimestamp(),
  };
}

/** Sets up the organization with the signed-in user as its first admin. Works only once. */
export async function foundOrganization(fullName: string, orgName: string): Promise<Profile> {
  const user = currentUser();
  const batch = writeBatch(db);
  batch.set(orgDoc(), { name: orgName.trim() || "Tauri", owner_id: user.uid, created_at: serverTimestamp() });
  batch.set(profileDoc(user.uid), { ...newProfile(user, fullName), role: "admin", client_id: null, invite_code: null });
  try {
    await commit(batch);
  } catch (error) {
    if ((error as { code?: string }).code === "permission-denied") {
      throw new AuthError("This organization is already set up. Ask an admin for an invite code.");
    }
    throw error;
  }
  return (await loadProfile(user.uid))!;
}

/** Joins as whatever role and client the invite was issued for. */
export async function redeemInvite(fullName: string, inviteCode: string): Promise<Profile> {
  const user = currentUser();
  const code = inviteCode.trim().toUpperCase();
  const invite = await getDoc(doc(db, "invites", code));
  if (!invite.exists() || invite.data().used_by) throw new AuthError("Invalid or already-used invite code");
  const { role, client_id } = invite.data();

  const batch = writeBatch(db);
  batch.update(invite.ref, { used_by: user.uid, used_at: serverTimestamp() });
  batch.set(profileDoc(user.uid), { ...newProfile(user, fullName), role, client_id, invite_code: code });
  try {
    await commit(batch);
  } catch (error) {
    throw friendlyError(error);
  }
  return (await loadProfile(user.uid))!;
}

export interface SignupPayload {
  full_name: string;
  email: string;
  password: string;
  /** Join with this code; without one, found the organization. */
  invite_code?: string;
  org_name?: string;
}

/** Finishes setup for a signed-in user who has no profile yet. */
export function completeProfile(payload: Pick<SignupPayload, "full_name" | "invite_code" | "org_name">): Promise<Profile> {
  return payload.invite_code?.trim()
    ? redeemInvite(payload.full_name, payload.invite_code)
    : foundOrganization(payload.full_name, payload.org_name ?? "");
}

export const AccountApi = {
  login: async (email: string, password: string): Promise<Profile | null> => {
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      return await loadProfile(user.uid);
    } catch (error) {
      throw friendlyError(error);
    }
  },

  signup: async (payload: SignupPayload): Promise<Profile> => {
    try {
      await createUserWithEmailAndPassword(auth, payload.email.trim(), payload.password);
    } catch (error) {
      throw friendlyError(error);
    }
    return completeProfile(payload);
  },

  logout: () => firebaseSignOut(auth),
};
