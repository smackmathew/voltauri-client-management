import type { Role } from "../types";
import { ssoLink, SSO_TARGETS } from "./sso";

export interface SiteLink {
  label: string;
  description: string;
  url: string;
  /** Who sees the link in the profile menu. */
  roles: Role[];
  /** This app. */
  current?: boolean;
  /** Signs in with the Portal login on the way: the link goes through /sso. */
  sso?: { target: keyof typeof SSO_TARGETS; next: string };
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
    url: SSO_TARGETS.admin.origin,
    roles: ["admin"],
    sso: { target: "admin", next: "/" },
  },
  {
    label: "Voltauri Sites",
    description: "Websites for home-services pros",
    url: "https://sites.voltauritech.com",
    roles: ["admin", "tech"],
  },
  {
    label: "Site hub",
    description: "Leads, client sites and the site builder",
    url: "https://sites.voltauritech.com/hub",
    roles: ["admin", "tech"],
    sso: { target: "sites", next: "/hub" },
  },
  {
    label: "Website",
    description: "voltauritech.com",
    url: "https://voltauritech.com",
    roles: ["admin", "tech"],
  },
];

/** Where the menu link goes: through the Portal's /sso for sites that share its login. */
export function siteHref(site: SiteLink): string {
  return site.sso ? ssoLink(site.sso.target, site.sso.next) : site.url;
}

export function sitesFor(role: Role): SiteLink[] {
  return SITE_LINKS.filter((s) => s.roles.includes(role));
}
