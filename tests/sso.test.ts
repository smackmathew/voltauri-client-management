import { describe, expect, it } from "vitest";
import { SSO_TARGETS, safeNext, ssoRedirectUrl, ssoTarget } from "../src/lib/sso";

describe("single sign-on links", () => {
  it("knows only its own targets", () => {
    expect(ssoTarget("admin")?.origin).toBe("https://admin.tauritechnologies.com");
    expect(ssoTarget("sites")?.roles).toEqual(["admin", "tech"]);
    for (const key of [null, "", "evil", "toString", "__proto__", "constructor"]) expect(ssoTarget(key)).toBeNull();
  });

  it("only lands on paths within the target site", () => {
    expect(safeNext("/hub/leads?x=1")).toBe("/hub/leads?x=1");
    for (const bad of [null, "", "hub", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/a\nb"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("puts the token in the fragment of the target's /sso page", () => {
    const url = new URL(ssoRedirectUrl(SSO_TARGETS.sites, "a.b.c", "//evil.example"));
    expect(url.origin).toBe("https://sites.voltauritech.com");
    expect(url.pathname).toBe("/sso");
    expect(url.search).toBe("");
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("token")).toBe("a.b.c");
    expect(params.get("next")).toBe("/");
  });
});
