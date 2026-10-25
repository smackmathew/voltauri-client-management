import { getDoc, doc } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/firebase/app";
import { fetchQuery } from "../src/firebase/data";
import { TasksApi, toTask, type TaskInput } from "../src/firebase/tasks";
import { seedOrganization, signInAs } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

describe("tasks", () => {
  let s: Seed;

  beforeAll(async () => {
    s = await seedOrganization();
  });

  const input = (fields: Partial<TaskInput> = {}): TaskInput => ({
    title: "Patch servers",
    description: null,
    client_id: s.acme.id,
    assignee: null,
    status: "todo",
    priority: "normal",
    due_date: "2026-11-01",
    ...fields,
  });

  it("lets staff create, assign and complete tasks", async () => {
    const tech = await signInAs(s.tech);
    const id = await TasksApi.create(input({ assignee: { id: tech.id, name: tech.full_name } }), tech.id);
    let task = toTask(await getDoc(doc(db, "tasks", id)));
    expect(task.completed_at).toBeNull();

    await TasksApi.setStatus(task, "done");
    task = toTask(await getDoc(doc(db, "tasks", id)));
    expect(task.status).toBe("done");
    expect(task.completed_at).not.toBeNull();

    await TasksApi.setStatus(task, "in_progress");
    task = toTask(await getDoc(doc(db, "tasks", id)));
    expect(task.completed_at).toBeNull();

    await expect(TasksApi.create(input({ due_date: "next week" }), tech.id)).rejects.toThrow();
    await expect(TasksApi.remove(id)).rejects.toThrow(); // only admins delete
  });

  it("shows clients their own tasks, read-only", async () => {
    const admin = await signInAs(s.admin);
    await TasksApi.create(input({ title: "Globex backup", client_id: s.globex.id }), admin.id);

    const acmeUser = await signInAs(s.acmeUser);
    const tasks = await fetchQuery(TasksApi.visibleQuery(acmeUser), toTask);
    expect(tasks.map((t) => t.title)).toEqual(["Patch servers"]);
    await expect(TasksApi.create(input(), acmeUser.id)).rejects.toThrow();
    await expect(TasksApi.setStatus(tasks[0], "done")).rejects.toThrow();
  });
});
