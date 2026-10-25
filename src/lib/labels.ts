import type { Priority, Role, TaskStatus, TicketStatus } from "../types";

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", tech: "Technician", client: "Client" };

export const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const PRIORITY_TONES: Record<Priority, Tone> = { low: "slate", normal: "blue", high: "amber", urgent: "red" };

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = { todo: "slate", in_progress: "blue", blocked: "red", done: "green" };

export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting on client",
  resolved: "Resolved",
  closed: "Closed",
};
export const TICKET_STATUS_TONES: Record<TicketStatus, Tone> = {
  open: "amber",
  in_progress: "blue",
  waiting: "violet",
  resolved: "green",
  closed: "slate",
};

export type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet";

export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
