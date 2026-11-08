import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import type { EmployeePrivate, Invite, Profile, Role } from "../types";
import { toProfile } from "./account";
import { db } from "./app";
import { commit, snapshotData, textOrNull, toDate, type Mapper } from "./data";

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

  /** Admins only: pay and notes for every employee. */
  privateQuery: () => collection(db, "employee_private"),
  privateDoc: (id: string) => doc(db, "employee_private", id),
  toPrivate: ((snap) => {
    const data = snapshotData(snap);
    return { pay_rate_cents: data.pay_rate_cents ?? null, notes: data.notes ?? null };
  }) as Mapper<EmployeePrivate>,

  /**
   * Admin: saves an employee's profile and, for staff, their private details, together.
   * Contact fields are trimmed and stored as null when blank.
   */
  saveEmployee: async (
    admin: Profile,
    person: Profile,
    changes: Pick<Profile, "full_name" | "role" | "client_id" | "active" | "phone" | "job_title" | "start_date">,
    privateDetails: EmployeePrivate | null,
  ) => {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", person.id), {
      full_name: changes.full_name.trim(),
      role: changes.role,
      client_id: changes.role === "client" ? changes.client_id : null,
      active: changes.active,
      phone: textOrNull(changes.phone),
      job_title: textOrNull(changes.job_title),
      start_date: changes.start_date || null,
    });
    if (privateDetails && changes.role !== "client") {
      batch.set(doc(db, "employee_private", person.id), {
        pay_rate_cents: privateDetails.pay_rate_cents,
        notes: textOrNull(privateDetails.notes),
        updated_by: admin.id,
        updated_at: serverTimestamp(),
      });
    }
    await commit(batch);
  },
};
