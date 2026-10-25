import {
  collection,
  doc,
  getDoc,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Query,
} from "firebase/firestore";
import type { Client, Profile, TimeEntry } from "../types";
import { db } from "./app";
import { commit, snapshotData, toDate, toDateOrNull, type Mapper } from "./data";

export const toEntry: Mapper<TimeEntry> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    tech_id: data.tech_id,
    tech_name: data.tech_name,
    client_id: data.client_id,
    client_name: data.client_name,
    task_id: data.task_id ?? null,
    ticket_id: data.ticket_id ?? null,
    notes: data.notes ?? "",
    clock_in: toDate(data.clock_in),
    clock_out: toDateOrNull(data.clock_out),
    edited_by: data.edited_by ?? null,
    edited_at: toDateOrNull(data.edited_at),
    edit_reason: data.edit_reason ?? null,
    original: data.original
      ? {
          clock_in: toDate(data.original.clock_in),
          clock_out: toDateOrNull(data.original.clock_out),
          client_id: data.original.client_id,
        }
      : null,
    invoice_id: data.invoice_id ?? null,
  };
};

const entries = () => collection(db, "time_entries");
const userDoc = (id: string) => doc(db, "users", id);

/** Milliseconds worked; an open entry counts up to `now`. */
export function entryDuration(entry: TimeEntry, now = new Date()): number {
  return Math.max(0, (entry.clock_out ?? now).getTime() - entry.clock_in.getTime());
}

/** Narrows a query to what the viewer is allowed to read. */
function scoped(viewer: Profile, ...constraints: Parameters<typeof query>[1][]): Query {
  if (viewer.role === "client") return query(entries(), where("client_id", "==", viewer.client_id), ...constraints);
  if (viewer.role === "tech") return query(entries(), where("tech_id", "==", viewer.id), ...constraints);
  return query(entries(), ...constraints);
}

export interface ClockInInput {
  client: Pick<Client, "id" | "name">;
  task_id?: string | null;
  ticket_id?: string | null;
  notes?: string;
}

export const TimeApi = {
  /** Entries that started in [from, to): everyone's for admins, a tech's own, or a client's. */
  rangeQuery: (viewer: Profile, from: Date, to: Date): Query =>
    scoped(viewer, where("clock_in", ">=", Timestamp.fromDate(from)), where("clock_in", "<", Timestamp.fromDate(to))),

  /** Who is on the clock right now (within what the viewer may see). */
  openQuery: (viewer: Profile): Query => scoped(viewer, where("clock_out", "==", null)),

  entryDoc: (id: string) => doc(entries(), id),

  /** Starts a shift. The server stamps the time. */
  clockIn: async (tech: Profile, input: ClockInInput): Promise<string> => {
    if (tech.active_entry_id) throw new Error("You're already clocked in");
    const ref = doc(entries());
    const batch = writeBatch(db);
    batch.set(ref, {
      tech_id: tech.id,
      tech_name: tech.full_name,
      client_id: input.client.id,
      client_name: input.client.name,
      task_id: input.task_id || null,
      ticket_id: input.ticket_id || null,
      notes: input.notes?.trim() ?? "",
      clock_in: serverTimestamp(),
      clock_out: null,
      edited_by: null,
      edited_at: null,
      edit_reason: null,
      original: null,
      invoice_id: null,
      created_by: tech.id,
      created_at: serverTimestamp(),
    });
    batch.update(userDoc(tech.id), { active_entry_id: ref.id });
    await commit(batch);
    return ref.id;
  },

  /** Ends the current shift. The server stamps the time. */
  clockOut: async (tech: Profile, notes: string): Promise<void> => {
    if (!tech.active_entry_id) throw new Error("You're not clocked in");
    const batch = writeBatch(db);
    batch.update(doc(entries(), tech.active_entry_id), { clock_out: serverTimestamp(), notes: notes.trim() });
    batch.update(userDoc(tech.id), { active_entry_id: null });
    await commit(batch);
  },

  updateNotes: (entryId: string, notes: string) =>
    commit(writeBatch(db).update(doc(entries(), entryId), { notes })),

  /**
   * Admin: corrects an entry. The first correction keeps the original punch alongside it.
   * Setting a clock-out on an open entry also takes the tech off the clock.
   */
  correct: async (
    admin: Profile,
    entry: TimeEntry,
    changes: { clock_in: Date; clock_out: Date | null; client?: Pick<Client, "id" | "name">; notes?: string },
    reason: string,
  ): Promise<void> => {
    const raw = (await getDoc(doc(entries(), entry.id))).data()!;
    const batch = writeBatch(db);
    batch.update(doc(entries(), entry.id), {
      clock_in: Timestamp.fromDate(changes.clock_in),
      clock_out: changes.clock_out ? Timestamp.fromDate(changes.clock_out) : null,
      ...(changes.client ? { client_id: changes.client.id, client_name: changes.client.name } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes.trim() } : {}),
      edited_by: admin.id,
      edited_at: serverTimestamp(),
      edit_reason: reason.trim(),
      // Copied from the stored document, not `entry`: a Date would drop the server
      // timestamp's microseconds and no longer match the original exactly.
      ...(raw.original ? {} : { original: { clock_in: raw.clock_in, clock_out: raw.clock_out ?? null, client_id: raw.client_id } }),
    });
    if (!entry.clock_out && changes.clock_out) batch.update(userDoc(entry.tech_id), { active_entry_id: null });
    await commit(batch);
  },

  /** Admin: records a shift the tech forgot to punch. */
  addManual: async (
    admin: Profile,
    tech: Pick<Profile, "id" | "full_name">,
    input: { client: Pick<Client, "id" | "name">; clock_in: Date; clock_out: Date; notes?: string },
    reason: string,
  ): Promise<string> => {
    const ref = doc(entries());
    const batch = writeBatch(db);
    batch.set(ref, {
      tech_id: tech.id,
      tech_name: tech.full_name,
      client_id: input.client.id,
      client_name: input.client.name,
      task_id: null,
      ticket_id: null,
      notes: input.notes?.trim() ?? "",
      clock_in: Timestamp.fromDate(input.clock_in),
      clock_out: Timestamp.fromDate(input.clock_out),
      edited_by: admin.id,
      edited_at: serverTimestamp(),
      edit_reason: reason.trim(),
      original: null,
      invoice_id: null,
      created_by: admin.id,
      created_at: serverTimestamp(),
    });
    await commit(batch);
    return ref.id;
  },
};
