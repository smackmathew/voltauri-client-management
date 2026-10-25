export type Role = "admin" | "tech" | "client";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  /** The client company a client user belongs to; null for staff. */
  client_id: string | null;
  active: boolean;
  /** The open time entry while this person is on the clock. */
  active_entry_id: string | null;
}

export interface Organization {
  name: string;
  owner_id: string;
}

export interface Invite {
  code: string;
  role: Role;
  client_id: string | null;
  email: string | null;
  created_at: Date;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

export type Priority = "low" | "normal" | "high" | "urgent";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  client_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  status: TaskStatus;
  priority: Priority;
  /** YYYY-MM-DD */
  due_date: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export interface Ticket {
  id: string;
  subject: string;
  description: string | null;
  client_id: string;
  requester_id: string;
  requester_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  status: TicketStatus;
  priority: Priority;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

export interface TicketComment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  /** Internal notes are visible to staff only. */
  internal: boolean;
  created_at: Date;
}

export interface TimeEntry {
  id: string;
  tech_id: string;
  tech_name: string;
  client_id: string;
  client_name: string;
  task_id: string | null;
  ticket_id: string | null;
  notes: string;
  clock_in: Date;
  /** null while the tech is still on the clock. */
  clock_out: Date | null;
  /** Set when an admin added or corrected the entry. */
  edited_by: string | null;
  edited_at: Date | null;
  edit_reason: string | null;
  /** The punch as first recorded, kept once an admin corrects it. */
  original: { clock_in: Date; clock_out: Date | null; client_id: string } | null;
}
