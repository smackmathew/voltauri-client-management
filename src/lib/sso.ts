import type { Role } from "../types";

/**
 * Single sign-on: the Portal is the one Voltauri login. Another Voltauri site sends people to
 * /sso?to=<target>&next=<path>; the Portal checks who they are and hands that site a fresh
 * Portal ID token, which the site's own server exchanges for a sign-in of its own.
 *
 * Tokens are only ever handed to the origins listed here.
 */
export interface SsoTarget {
  label: string;
  /** Where the token goes: the site's /sso page reads it from the URL fragment. */
  origin: string;
  roles: Role[];
}

export const SSO_TARGETS: Record<string, SsoTarget> = {
  admin: {
    label: "Admin",
    // Becomes https://admin.voltauritech.com once that domain is connected.
    origin: "https://admin.tauritechnologies.com",
    roles: ["admin"],
  },
  sites: {
    label: "Voltauri Sites",
    origin: "https://sites.voltauritech.com",
    roles: ["admin", "tech"],
  },
};

export function ssoTarget(key: string | null): SsoTarget | null {
  return key && Object.prototype.hasOwnProperty.call(SSO_TARGETS, key) ? SSO_TARGETS[key] : null;
}

/** A path on the target site to land on; anything that could leave the site becomes "/". */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}

/** The fragment never reaches a server or its logs, unlike a query string. */
export function ssoRedirectUrl(target: SsoTarget, idToken: string, next: string | null): string {
  return `${target.origin}/sso#token=${encodeURIComponent(idToken)}&next=${encodeURIComponent(safeNext(next))}`;
}

/** The Portal link that signs someone into `key` and lands them on `next`. */
export function ssoLink(key: keyof typeof SSO_TARGETS, next = "/"): string {
  return `/sso?to=${encodeURIComponent(key)}&next=${encodeURIComponent(next)}`;
}
