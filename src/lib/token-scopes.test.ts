import { describe, expect, it } from "vitest";

import { effectiveScopes, isGrandfathered, TOKEN_SCOPES } from "./token-scopes";

describe("isGrandfathered", () => {
  it("is true only for an empty scopes array (pre-scope token)", () => {
    expect(isGrandfathered([])).toBe(true);
    expect(isGrandfathered(["read"])).toBe(false);
    expect(isGrandfathered(["read", "write", "admin"])).toBe(false);
  });
});

describe("effectiveScopes", () => {
  it("grandfathers empty scopes to full access", () => {
    expect(effectiveScopes([])).toEqual([...TOKEN_SCOPES]);
  });

  it("passes explicit scopes through", () => {
    expect(effectiveScopes(["read"])).toEqual(["read"]);
    expect(effectiveScopes(["read", "write"])).toEqual(["read", "write"]);
    expect(effectiveScopes(["read", "write", "admin"])).toEqual([
      "read",
      "write",
      "admin",
    ]);
  });

  it("drops unknown scope values instead of granting them", () => {
    expect(effectiveScopes(["write", "superuser"])).toEqual(["write"]);
  });

  it("normalizes ordering to the canonical scope order", () => {
    expect(effectiveScopes(["admin", "read"])).toEqual(["read", "admin"]);
  });
});
