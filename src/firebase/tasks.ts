import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, type Query } from "firebase/firestore";
import type { Priority, Profile, Task, TaskStatus } from "../types";
import { db } from "./app";
import { snapshotData, textOrNull, toDate, toDateOrNull, type Mapper } from "./data";

export interface TaskInput {
  title: string;
  description: string | null;
  client_id: string;
  assignee: { id: string; name: string } | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
}

export const toTask: Mapper<Task> = (snap) => {
  const data = snapshotData(snap);
  return {
    id: snap.id,
    title: data.title,
    description: data.description ?? null,
    client_id: data.client_id,
    assignee_id: data.assignee_id ?? null,
    assignee_name: data.assignee_name ?? null,
    status: data.status,
    priority: data.priority,
    due_date: data.due_date ?? null,
    created_by: data.created_by,
    created_at: toDate(data.created_at),
    updated_at: toDate(data.updated_at),
    completed_at: toDateOrNull(data.completed_at),
  };
};

const tasks = () => collection(db, "tasks");

function fields(input: TaskInput, wasDone: boolean) {
  return {
    title: input.title.trim(),
    description: textOrNull(input.description),
    client_id: input.client_id,
    assignee_id: input.assignee?.id ?? null,
    assignee_name: input.assignee?.name ?? null,
    status: input.status,
    priority: input.priority,
    due_date: input.due_date || null,
    updated_at: serverTimestamp(),
    // Keep the original completion time when a done task is edited.
    ...(input.status !== "done" ? { completed_at: null } : wasDone ? {} : { completed_at: serverTimestamp() }),
  };
}

export const TasksApi = {
  /** Every task the viewer may see: all of them for staff, their company's for a client. */
  visibleQuery: (viewer: Profile): Query =>
    viewer.role === "client" ? query(tasks(), where("client_id", "==", viewer.client_id)) : tasks(),

  create: async (input: TaskInput, createdBy: string): Promise<string> => {
    const ref = doc(tasks());
    await setDoc(ref, { ...fields(input, false), created_by: createdBy, created_at: serverTimestamp() });
    return ref.id;
  },

  update: (task: Task, input: TaskInput) => updateDoc(doc(tasks(), task.id), fields(input, task.status === "done")),

  setStatus: (task: Task, status: TaskStatus) =>
    TasksApi.update(task, {
      ...task,
      status,
      assignee: task.assignee_id ? { id: task.assignee_id, name: task.assignee_name ?? "" } : null,
    }),

  remove: (id: string) => deleteDoc(doc(tasks(), id)),
};
