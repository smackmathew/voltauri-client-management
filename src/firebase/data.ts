import {
  getDocs,
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type Timestamp,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";

/** Document data with pending server timestamps filled in with a local estimate. */
export function snapshotData(snap: DocumentSnapshot): DocumentData {
  return snap.data({ serverTimestamps: "estimate" }) ?? {};
}

export function toDate(value: Timestamp | null | undefined): Date {
  return value ? value.toDate() : new Date();
}

export function toDateOrNull(value: Timestamp | null | undefined): Date | null {
  return value ? value.toDate() : null;
}

/** Trims a text field, storing blanks as null. */
export function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Commits a batch. Online, waits for the server so errors (such as a rejected write) reach
 * the caller. Offline, returns right away: the write is already applied to the local cache
 * and syncs when the connection returns.
 */
export async function commit(batch: WriteBatch): Promise<void> {
  const pending = batch.commit();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    pending.catch((error) => console.error("Offline change was rejected when it synced", error));
    return;
  }
  await pending;
}

export type Mapper<T> = (snap: DocumentSnapshot) => T;

/** Calls `onData` with the query's results now and again every time they change. */
export function watchQuery<T>(
  query: Query,
  map: Mapper<T>,
  onData: (rows: T[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(query, (snap) => onData(snap.docs.map(map)), onError);
}

export function watchDoc<T>(
  ref: DocumentReference,
  map: Mapper<T>,
  onData: (row: T | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(ref, (snap) => onData(snap.exists() ? map(snap) : null), onError);
}

/** One-off read of a query (used by exports and tests). */
export async function fetchQuery<T>(query: Query, map: Mapper<T>): Promise<T[]> {
  const snap = await getDocs(query);
  return snap.docs.map(map);
}
