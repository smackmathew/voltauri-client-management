import { getDoc, updateDoc } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { fetchQuery } from "../src/firebase/data";
import { TicketsApi, toComment, toTicket } from "../src/firebase/tickets";
import { seedOrganization, signInAs } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

describe("help desk", () => {
  let s: Seed;
  let ticketId: string;

  beforeAll(async () => {
    s = await seedOrganization();
    const acmeUser = await signInAs(s.acmeUser);
    ticketId = await TicketsApi.create(
      { subject: "Email is down", description: "Since 9am", client_id: s.acme.id, priority: "high" },
      acmeUser,
    );
  });

  it("lets a client open tickets for their own company only", async () => {
    const acmeUser = await signInAs(s.acmeUser);
    const ticket = toTicket(await getDoc(TicketsApi.ticketDoc(ticketId)));
    expect(ticket.status).toBe("open");
    expect(ticket.requester_name).toBe("Ann Acme");

    await expect(
      TicketsApi.create({ subject: "Not mine", description: null, client_id: s.globex.id, priority: "low" }, acmeUser),
    ).rejects.toThrow();
  });

  it("keeps each client's tickets private to them", async () => {
    const globexUser = await signInAs(s.globexUser);
    expect(await fetchQuery(TicketsApi.visibleQuery(globexUser), toTicket)).toEqual([]);
    await expect(getDoc(TicketsApi.ticketDoc(ticketId))).rejects.toThrow();

    const acmeUser = await signInAs(s.acmeUser);
    expect((await fetchQuery(TicketsApi.visibleQuery(acmeUser), toTicket)).map((t) => t.id)).toEqual([ticketId]);
  });

  it("lets staff work the ticket, and the client only close or reopen it", async () => {
    const tech = await signInAs(s.tech);
    let ticket = toTicket(await getDoc(TicketsApi.ticketDoc(ticketId)));
    await TicketsApi.update(ticket, { status: "in_progress", assignee: { id: tech.id, name: tech.full_name } });

    await signInAs(s.acmeUser);
    ticket = toTicket(await getDoc(TicketsApi.ticketDoc(ticketId)));
    expect(ticket.assignee_name).toBe("Terry Tech");
    await expect(TicketsApi.update(ticket, { status: "waiting" })).rejects.toThrow();
    await expect(TicketsApi.update(ticket, { priority: "urgent" })).rejects.toThrow();
    await expect(updateDoc(TicketsApi.ticketDoc(ticketId), { client_id: s.globex.id })).rejects.toThrow();

    await TicketsApi.update(ticket, { status: "closed" });
    ticket = toTicket(await getDoc(TicketsApi.ticketDoc(ticketId)));
    expect(ticket.resolved_at).not.toBeNull();

    await TicketsApi.update(ticket, { status: "open" });
    ticket = toTicket(await getDoc(TicketsApi.ticketDoc(ticketId)));
    expect(ticket.resolved_at).toBeNull();
  });

  it("hides internal notes from the client", async () => {
    const tech = await signInAs(s.tech);
    await TicketsApi.addComment(ticketId, tech, "Restarting the mail server now");
    await TicketsApi.addComment(ticketId, tech, "Their admin password is in the vault", true);

    const acmeUser = await signInAs(s.acmeUser);
    await TicketsApi.addComment(ticketId, acmeUser, "Thanks!", true); // a client can't post internally
    const seen = await fetchQuery(TicketsApi.commentsQuery(ticketId, acmeUser), toComment);
    expect(seen.map((c) => c.body).sort()).toEqual(["Restarting the mail server now", "Thanks!"]);
    // Asking for everything, internal notes included, is refused outright.
    await expect(fetchQuery(TicketsApi.commentsQuery(ticketId, { ...acmeUser, role: "tech" }), toComment)).rejects.toThrow();

    const admin = await signInAs(s.admin);
    expect(await fetchQuery(TicketsApi.commentsQuery(ticketId, admin), toComment)).toHaveLength(3);

    const globexUser = await signInAs(s.globexUser);
    await expect(TicketsApi.addComment(ticketId, globexUser, "Me too")).rejects.toThrow();
  });
});
