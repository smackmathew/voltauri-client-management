import type { Role } from "../types";

export interface SiteLink {
  label: string;
  description: string;
  url: string;
  /** Who sees the link in the profile menu. */
  roles: Role[];
  /** This app. */
  current?: boolean;
}

/** Every Voltauri site, as listed in the profile menu. */
export const SITE_LINKS: SiteLink[] = [
  {
    label: "Portal",
    description: "Clients, time, help desk and billing",
    url: "https://portal.voltauritech.com",
    roles: ["admin", "tech", "client"],
    current: true,
  },
  {
    label: "Admin",
    description: "Leads and sales pipeline",
    // Becomes https://admin.voltauritech.com once that domain is connected in Firebase and DNS.
    url: "https://admin.tauritechnologies.com",
    roles: ["admin"],
  },
  {
    label: "Voltauri Sites",
    description: "Website builder for clients",
    url: "https://sites.voltauritech.com",
    roles: ["admin"],
  },
  {
    label: "Site hub",
    description: "Every client website in one place",
    url: "https://sites.voltauritech.com/hub",
    roles: ["admin"],
  },
  {
    label: "Website",
    description: "voltauritech.com",
    url: "https://voltauritech.com",
    roles: ["admin", "tech", "client"],
  },
];

export function sitesFor(role: Role): SiteLink[] {
  return SITE_LINKS.filter((s) => s.roles.includes(role));
}
