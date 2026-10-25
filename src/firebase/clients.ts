import { collection, doc, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { Client } from "../types";
import { db } from "./app";
import { snapshotData, textOrNull, type Mapper } from "./data";

export type ClientInput = Omit<Client, "id">;

export const toClient: Mapper<Client> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    name: data.name,
    contact_name: data.contact_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
    active: data.active === true,
    hourly_rate_cents: data.hourly_rate_cents ?? null,
  };
};

function fields(input: ClientInput) {
  return {
    name: input.name.trim(),
    contact_name: textOrNull(input.contact_name),
    email: textOrNull(input.email),
    phone: textOrNull(input.phone),
    address: textOrNull(input.address),
    notes: textOrNull(input.notes),
    active: input.active,
    hourly_rate_cents: input.hourly_rate_cents,
  };
}

export const ClientsApi = {
  /** All clients. Staff only; a client user reads just their own with `clientDoc`. */
  allQuery: () => query(collection(db, "clients"), orderBy("name")),
  clientDoc: (id: string) => doc(db, "clients", id),

  create: async (input: ClientInput): Promise<string> => {
    const ref = doc(collection(db, "clients"));
    await setDoc(ref, { ...fields(input), created_at: serverTimestamp() });
    return ref.id;
  },

  update: (id: string, input: ClientInput) => updateDoc(doc(db, "clients", id), fields(input)),
};
