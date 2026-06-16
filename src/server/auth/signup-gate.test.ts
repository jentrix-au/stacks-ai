import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { userFindFirst, userCount, invitationFindFirst } = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userCount: vi.fn(),
  invitationFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: userFindFirst, count: userCount },
    invitation: { findFirst: invitationFindFirst },
  },
}));

import { isSignInAllowed } from "./signup-gate";

beforeEach(() => {
  userFindFirst.mockReset().mockResolvedValue(null);
  // A populated instance by default; bootstrap tests override to 0.
  userCount.mockReset().mockResolvedValue(1);
  invitationFindFirst.mockReset().mockResolvedValue(null);
  delete process.env.SIGNUP_ALLOWLIST;
  delete process.env.OPEN_SIGNUP;
});

afterEach(() => {
  delete process.env.SIGNUP_ALLOWLIST;
  delete process.env.OPEN_SIGNUP;
});

describe("isSignInAllowed — shared", () => {
  it("rejects an empty/missing email without touching the database", async () => {
    expect(await isSignInAllowed("")).toBe(false);
    expect(await isSignInAllowed(null)).toBe(false);
    expect(await isSignInAllowed(undefined)).toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it("always allows an existing user, even in invite-only mode", async () => {
    process.env.OPEN_SIGNUP = "false";
    userFindFirst.mockResolvedValue({ id: "user_1" });
    expect(await isSignInAllowed("existing@example.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it("normalizes case/whitespace before checking", async () => {
    await isSignInAllowed("  Invited@Example.com  ");
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "invited@example.com", mode: "insensitive" } },
      }),
    );
  });
});

describe("isSignInAllowed — open registration (default)", () => {
  it("allows any new email when OPEN_SIGNUP is unset (open by default)", async () => {
    expect(await isSignInAllowed("stranger@example.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
    expect(userCount).not.toHaveBeenCalled();
  });

  it("treats an explicit truthy value as open", async () => {
    process.env.OPEN_SIGNUP = "true";
    expect(await isSignInAllowed("stranger@example.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });
});

describe("isSignInAllowed — invite-only (OPEN_SIGNUP=false)", () => {
  beforeEach(() => {
    process.env.OPEN_SIGNUP = "false";
  });

  it("allows the first-ever user to bootstrap an empty instance", async () => {
    userCount.mockResolvedValue(0);
    expect(await isSignInAllowed("founder@example.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a new email with no invitation and no allowlist", async () => {
    userCount.mockResolvedValue(3);
    expect(await isSignInAllowed("stranger@example.com")).toBe(false);
    expect(invitationFindFirst).toHaveBeenCalledOnce();
  });

  it("allows a new email with a pending, unexpired invitation", async () => {
    userCount.mockResolvedValue(3);
    invitationFindFirst.mockResolvedValue({ id: "inv_1" });
    expect(await isSignInAllowed("invited@example.com")).toBe(true);
  });

  it("allows an allowlisted exact email without an invitation lookup", async () => {
    userCount.mockResolvedValue(3);
    process.env.SIGNUP_ALLOWLIST = "founder@acme.com, other@acme.com";
    expect(await isSignInAllowed("founder@acme.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it("allows an allowlisted domain suffix", async () => {
    userCount.mockResolvedValue(3);
    process.env.SIGNUP_ALLOWLIST = "@acme.com";
    expect(await isSignInAllowed("anyone@acme.com")).toBe(true);
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to the invitation check when the allowlist does not match", async () => {
    userCount.mockResolvedValue(3);
    process.env.SIGNUP_ALLOWLIST = "@acme.com";
    expect(await isSignInAllowed("person@other.com")).toBe(false);
    expect(invitationFindFirst).toHaveBeenCalledOnce();
  });

  it("treats 0 / no / off / FALSE as invite-only too", async () => {
    userCount.mockResolvedValue(3);
    for (const value of ["0", "no", "off", "FALSE"]) {
      invitationFindFirst.mockClear();
      process.env.OPEN_SIGNUP = value;
      expect(await isSignInAllowed("stranger@example.com")).toBe(false);
      expect(invitationFindFirst).toHaveBeenCalledOnce();
    }
  });
});
