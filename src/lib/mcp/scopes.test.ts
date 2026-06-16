import { describe, expect, it } from "vitest";

import { scopeViolation, type ToolClass } from "./scopes";

const CLASSES: ToolClass[] = ["read", "write", "admin"];

// Full authz matrix: token scope set × tool class → allowed?
// Note the guard sees EFFECTIVE scopes — grandfathered tokens (empty array
// in the DB) are mapped to all three scopes in verifyToken before this
// layer, so an empty array here means "no access" (defense in depth).
const MATRIX: Array<{
  scopes: string[] | undefined;
  allowed: Record<ToolClass, boolean>;
}> = [
  { scopes: undefined, allowed: { read: false, write: false, admin: false } },
  { scopes: [], allowed: { read: false, write: false, admin: false } },
  { scopes: ["read"], allowed: { read: true, write: false, admin: false } },
  { scopes: ["write"], allowed: { read: false, write: true, admin: false } },
  { scopes: ["admin"], allowed: { read: false, write: false, admin: true } },
  {
    scopes: ["read", "write"],
    allowed: { read: true, write: true, admin: false },
  },
  {
    scopes: ["read", "admin"],
    allowed: { read: true, write: false, admin: true },
  },
  {
    scopes: ["read", "write", "admin"],
    allowed: { read: true, write: true, admin: true },
  },
];

describe("scopeViolation matrix", () => {
  for (const { scopes, allowed } of MATRIX) {
    for (const toolClass of CLASSES) {
      const label = `scopes=${JSON.stringify(scopes)} × class=${toolClass}`;
      if (allowed[toolClass]) {
        it(`${label} → allowed`, () => {
          expect(scopeViolation(scopes, toolClass)).toBeNull();
        });
      } else {
        it(`${label} → FORBIDDEN`, () => {
          const payload = scopeViolation(scopes, toolClass);
          expect(payload).not.toBeNull();
          expect(payload!.error.code).toBe("FORBIDDEN");
          expect(payload!.error.message).toContain(`"${toolClass}" scope`);
          expect(payload!.error.hint).toContain("API tokens");
        });
      }
    }
  }
});

describe("scopeViolation payload", () => {
  it("names the token's actual scopes so the agent can self-diagnose", () => {
    const payload = scopeViolation(["read"], "write");
    expect(payload!.error.message).toContain("read");
  });

  it("says 'none' when the token has no scopes at all", () => {
    const payload = scopeViolation([], "read");
    expect(payload!.error.message).toContain("none");
  });
});
