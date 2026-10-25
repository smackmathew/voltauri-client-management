import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ClientsApi, toClient } from "../firebase/clients";
import { TeamApi } from "../firebase/team";
import { useLiveDoc, useLiveQuery } from "../lib/useLive";
import type { Client, Profile } from "../types";
import { useProfile } from "./AuthContext";

interface Directory {
  /** Clients the viewer can see: all of them for staff, their own for a client user. */
  clients: Client[];
  clientName: (id: string | null) => string;
  /** Staff (admins and techs), for assigning work. Empty for client users. */
  staff: Profile[];
  /** Everyone with an account. Empty for client users. */
  people: Profile[];
  loading: boolean;
}

const DirectoryContext = createContext<Directory | undefined>(undefined);

/** Live lists of clients and people, shared by every page. */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const isStaff = profile.role !== "client";
  const key = `${profile.id}:${profile.role}:${profile.client_id}:${profile.active}`;

  const allClients = useLiveQuery(isStaff ? ClientsApi.allQuery() : null, toClient, key);
  const ownClient = useLiveDoc(!isStaff && profile.client_id ? ClientsApi.clientDoc(profile.client_id) : null, toClient, key);
  const people = useLiveQuery(isStaff ? TeamApi.peopleQuery() : null, TeamApi.toProfile, key);

  const value = useMemo<Directory>(() => {
    const clients = isStaff ? allClients.data : ownClient.data ? [ownClient.data] : [];
    const byId = new Map(clients.map((c) => [c.id, c.name]));
    const sortedPeople = [...people.data].sort((a, b) => a.full_name.localeCompare(b.full_name));
    return {
      clients,
      clientName: (id) => (id ? byId.get(id) ?? "Unknown client" : "—"),
      staff: sortedPeople.filter((p) => p.role !== "client" && p.active),
      people: sortedPeople,
      loading: allClients.loading || ownClient.loading || people.loading,
    };
  }, [isStaff, allClients, ownClient, people]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): Directory {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used within DirectoryProvider");
  return ctx;
}
