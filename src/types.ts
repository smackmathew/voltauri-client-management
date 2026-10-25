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

export interface BillingSettings {
  /** Printed under the company name on invoices. */
  address: string | null;
  /** ISO 4217, e.g. "USD". */
  currency: string;
  /** Charged when a client has no rate of its own. */
  default_rate_cents: number;
  /** Each time entry is billed rounded up to this many minutes. */
  billing_increment_minutes: number;
  /** Default tax for new invoices, in basis points (825 = 8.25%). */
  default_tax_rate_bp: number;
  payment_terms_days: number;
  payment_instructions: string | null;
}

export interface Organization extends BillingSettings {
  name: string;
  owner_id: string;
  next_invoice_number: number;
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
  /** This client's hourly rate; null uses the company default. */
  hourly_rate_cents: number | null;
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
  /** The invoice this entry was billed on. Billed entries can't be changed. */
  invoice_id: string | null;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

/** A billed time entry, with the rate as it was when the invoice was made. */
export interface TimeLine {
  entry_id: string;
  /** YYYY-MM-DD */
  date: string;
  tech_name: string;
  description: string;
  actual_minutes: number;
  /** Rounded up to the billing increment. */
  minutes: number;
  rate_cents: number;
  amount_cents: number;
}

/** Anything else on the invoice: parts, licences, a flat fee. */
export interface ExtraLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

export interface Invoice {
  id: string;
  number: number;
  client_id: string;
  client_name: string;
  /** The client's address and contact, as of when the invoice was made. */
  bill_to: string | null;
  /** Tauri's name, address and payment details, as of when the invoice was made. */
  issuer: { name: string; address: string | null; payment_instructions: string | null };
  currency: string;
  status: InvoiceStatus;
  /** YYYY-MM-DD */
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  entry_ids: string[];
  time_lines: TimeLine[];
  extra_lines: ExtraLine[];
  tax_rate_bp: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  created_at: Date;
  sent_at: Date | null;
  paid_at: Date | null;
  voided_at: Date | null;
}
