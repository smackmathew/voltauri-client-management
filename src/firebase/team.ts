import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import type { Invite, Profile, Role } from "../types";
import { toProfile } from "./account";
import { db } from "./app";
import { snapshotData, toDate, type Mapper } from "./data";

// No 0/O or 1/I, so a code read aloud or copied by hand comes through intact.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

export const toInvite: Mapper<Invite> = (snap) => {
  const data = snapshotData(snap);
  return {
    code: snap.id,
    role: data.role,
    client_id: data.client_id ?? null,
    email: data.email ?? null,
    created_at: toDate(data.created_at),
  };
};

export const TeamApi = {
  /** Everyone with an account: staff and client users. Staff only. */
  peopleQuery: () => collection(db, "users"),
  toProfile: toProfile as Mapper<Profile>,

  /** Invites nobody has redeemed yet. Admins only. */
  pendingInvitesQuery: () => query(collection(db, "invites"), where("used_by", "==", null)),

  createInvite: async (payload: { role: Role; client_id: string | null; email?: string | null }, createdBy: string): Promise<string> => {
    const code = newInviteCode();
    await setDoc(doc(db, "invites", code), {
      role: payload.role,
      client_id: payload.role === "client" ? payload.client_id : null,
      email: payload.email?.trim().toLowerCase() || null,
      created_by: createdBy,
      created_at: serverTimestamp(),
      used_by: null,
      used_at: null,
    });
    return code;
  },

  revokeInvite: (code: string) => deleteDoc(doc(db, "invites", code)),

  updatePerson: (id: string, changes: Partial<Pick<Profile, "full_name" | "role" | "client_id" | "active">>) => {
    const update: Record<string, unknown> = { ...changes };
    if (changes.role && changes.role !== "client") update.client_id = null;
    return updateDoc(doc(db, "users", id), update);
  },
};
