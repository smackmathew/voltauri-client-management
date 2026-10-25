import {
  addDoc,
  collection,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Query,
} from "firebase/firestore";
import type { Priority, Profile, Ticket, TicketComment, TicketStatus } from "../types";
import { db } from "./app";
import { snapshotData, textOrNull, toDate, toDateOrNull, type Mapper } from "./data";

export const toTicket: Mapper<Ticket> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    subject: data.subject,
    description: data.description ?? null,
    client_id: data.client_id,
    requester_id: data.requester_id,
    requester_name: data.requester_name,
    assignee_id: data.assignee_id ?? null,
    assignee_name: data.assignee_name ?? null,
    status: data.status,
    priority: data.priority,
    created_at: toDate(data.created_at),
    updated_at: toDate(data.updated_at),
    resolved_at: toDateOrNull(data.resolved_at),
  };
};

export const toComment: Mapper<TicketComment> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    author_id: data.author_id,
    author_name: data.author_name,
    body: data.body,
    internal: data.internal === true,
    created_at: toDate(data.created_at),
  };
};

const tickets = () => collection(db, "tickets");

export const isClosedStatus = (status: TicketStatus) => status === "resolved" || status === "closed";

export interface NewTicket {
  subject: string;
  description: string | null;
  client_id: string;
  priority: Priority;
}

export const TicketsApi = {
  visibleQuery: (viewer: Profile): Query =>
    viewer.role === "client" ? query(tickets(), where("client_id", "==", viewer.client_id)) : tickets(),

  ticketDoc: (id: string) => doc(tickets(), id),

  /** The thread, minus internal notes for client users. */
  commentsQuery: (ticketId: string, viewer: Profile): Query => {
    const comments = collection(tickets(), ticketId, "comments");
    return viewer.role === "client" ? query(comments, where("internal", "==", false)) : comments;
  },

  create: async (input: NewTicket, requester: Profile): Promise<string> => {
    const ref = doc(tickets());
    await setDoc(ref, {
      subject: input.subject.trim(),
      description: textOrNull(input.description),
      client_id: input.client_id,
      requester_id: requester.id,
      requester_name: requester.full_name,
      assignee_id: null,
      assignee_name: null,
      status: "open",
      priority: input.priority,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      resolved_at: null,
    });
    return ref.id;
  },

  /** Staff: change status, priority or assignee. Clients may only close or reopen. */
  update: (
    ticket: Ticket,
    changes: Partial<{ status: TicketStatus; priority: Priority; assignee: { id: string; name: string } | null }>,
  ) => {
    const update: Record<string, unknown> = { updated_at: serverTimestamp() };
    if (changes.status) {
      update.status = changes.status;
      // Stamped when the ticket is first resolved or closed, and cleared if it's reopened.
      if (!isClosedStatus(changes.status)) update.resolved_at = null;
      else if (!ticket.resolved_at) update.resolved_at = serverTimestamp();
    }
    if (changes.priority) update.priority = changes.priority;
    if (changes.assignee !== undefined) {
      update.assignee_id = changes.assignee?.id ?? null;
      update.assignee_name = changes.assignee?.name ?? null;
    }
    return updateDoc(doc(tickets(), ticket.id), update);
  },

  addComment: (ticketId: string, author: Profile, body: string, internal = false) =>
    addDoc(collection(tickets(), ticketId, "comments"), {
      author_id: author.id,
      author_name: author.full_name,
      body: body.trim(),
      internal: author.role !== "client" && internal,
      created_at: serverTimestamp(),
    }),
};
