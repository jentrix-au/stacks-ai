import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    const table: Record<string, string> = {
      "public.example.com": "93.184.216.34",
      "internal.example.com": "10.1.2.3",
      "linklocal.example.com": "169.254.169.254",
    };
    const address = table[host];
    if (!address) throw new Error("ENOTFOUND");
    return [{ address, family: 4 }];
  }),
}));

import {
  assertSafeWebhookUrl,
  isPrivateAddress,
  signWebhookBody,
  verifyWebhookSignature,
} from "./security";

describe("webhook signing", () => {
  const secret = "whsec_test";
  const body = '{"id":"dlv_1","event":"task.created"}';
  const ts = "1765500000";

  it("signs deterministically and verifies", () => {
    const sig = signWebhookBody(secret, ts, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, ts, body, sig)).toBe(true);
  });

  it("signature changes with body, timestamp, and secret", () => {
    const sig = signWebhookBody(secret, ts, body);
    expect(signWebhookBody(secret, ts, body + " ")).not.toBe(sig);
    expect(signWebhookBody(secret, "1765500001", body)).not.toBe(sig);
    expect(signWebhookBody("whsec_other", ts, body)).not.toBe(sig);
    expect(verifyWebhookSignature(secret, ts, body + " ", sig)).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("flags %s as private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])(
    "allows public %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("assertSafeWebhookUrl (SSRF guard)", () => {
  afterEach(() => {
    delete process.env.STACKS_WEBHOOK_ALLOW_PRIVATE;
  });

  it("accepts a public https URL", async () => {
    await expect(
      assertSafeWebhookUrl("https://public.example.com/hook"),
    ).resolves.toBeUndefined();
  });

  it("rejects non-https schemes", async () => {
    await expect(
      assertSafeWebhookUrl("http://public.example.com/hook"),
    ).rejects.toThrow(/https/);
    await expect(assertSafeWebhookUrl("ftp://example.com")).rejects.toThrow();
  });

  it("rejects localhost, IP literals in private ranges, and embedded credentials", async () => {
    await expect(
      assertSafeWebhookUrl("https://localhost/hook"),
    ).rejects.toThrow(/localhost/);
    await expect(
      assertSafeWebhookUrl("https://127.0.0.1/hook"),
    ).rejects.toThrow(/private/);
    await expect(
      assertSafeWebhookUrl("https://192.168.0.10/hook"),
    ).rejects.toThrow(/private/);
    await expect(
      assertSafeWebhookUrl("https://user:pass@public.example.com/hook"),
    ).rejects.toThrow(/credentials/);
  });

  it("rejects hostnames that resolve to private or link-local addresses", async () => {
    await expect(
      assertSafeWebhookUrl("https://internal.example.com/hook"),
    ).rejects.toThrow(/private/);
    await expect(
      assertSafeWebhookUrl("https://linklocal.example.com/hook"),
    ).rejects.toThrow(/private/);
  });

  it("rejects unresolvable hosts and garbage URLs", async () => {
    await expect(
      assertSafeWebhookUrl("https://nope.example.com/hook"),
    ).rejects.toThrow(/resolve/);
    await expect(assertSafeWebhookUrl("not a url")).rejects.toThrow(/Invalid/);
  });

  it("the explicit dev escape hatch bypasses the guard", async () => {
    process.env.STACKS_WEBHOOK_ALLOW_PRIVATE = "1";
    await expect(
      assertSafeWebhookUrl("http://127.0.0.1:9999/hook"),
    ).resolves.toBeUndefined();
  });
});
