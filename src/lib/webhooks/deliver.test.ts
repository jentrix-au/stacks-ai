import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { attemptDelivery, backoffMs, MAX_ATTEMPTS } from "./deliver";
import { verifyWebhookSignature } from "./security";

describe("backoffMs", () => {
  it("doubles per attempt and caps at 2h", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(MAX_ATTEMPTS)).toBe(2 * 60 * 60 * 1000);
  });
});

// The e2e-ish receiver test from the P2.6 acceptance: a real HTTP server
// receives a signed delivery and the signature verifies.
describe("attemptDelivery against a local receiver", () => {
  let server: Server;
  let port: number;
  let received: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
  } | null = null;
  let respondWith = 200;

  beforeAll(async () => {
    process.env.STACKS_WEBHOOK_ALLOW_PRIVATE = "1";
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received = { headers: req.headers, body };
        res.statusCode = respondWith;
        res.end();
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    delete process.env.STACKS_WEBHOOK_ALLOW_PRIVATE;
    await new Promise((resolve) => server.close(resolve));
  });

  const webhook = () => ({
    url: `http://127.0.0.1:${port}/hook`,
    secret: "whsec_local_test",
  });

  const delivery = {
    id: "dlv_1",
    event: "task.created",
    payload: { boardId: "board_1", taskId: "task_1" },
    createdAt: new Date("2026-06-12T12:00:00.000Z"),
  };

  it("POSTs a signed body the receiver can verify", async () => {
    respondWith = 200;
    const outcome = await attemptDelivery(webhook(), delivery);
    expect(outcome).toEqual({ ok: true, status: 200 });

    expect(received).not.toBeNull();
    const headers = received!.headers;
    expect(headers["x-stacks-event"]).toBe("task.created");
    expect(headers["x-stacks-delivery-id"]).toBe("dlv_1");
    expect(headers["content-type"]).toBe("application/json");

    const timestamp = headers["x-stacks-timestamp"] as string;
    const signature = headers["x-stacks-signature"] as string;
    expect(
      verifyWebhookSignature(
        "whsec_local_test",
        timestamp,
        received!.body,
        signature,
      ),
    ).toBe(true);
    // Tampered body fails verification.
    expect(
      verifyWebhookSignature(
        "whsec_local_test",
        timestamp,
        received!.body + "x",
        signature,
      ),
    ).toBe(false);

    const parsed = JSON.parse(received!.body);
    expect(parsed.event).toBe("task.created");
    expect(parsed.data).toEqual({ boardId: "board_1", taskId: "task_1" });
    expect(parsed.id).toBe("dlv_1");
  });

  it("treats non-2xx as failure with the status in the error", async () => {
    respondWith = 500;
    const outcome = await attemptDelivery(webhook(), delivery);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(500);
  });

  it("treats a connection error as failure", async () => {
    const outcome = await attemptDelivery(
      { url: "http://127.0.0.1:1/unreachable", secret: "s" },
      delivery,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("fails fast on unsafe URLs without the escape hatch", async () => {
    delete process.env.STACKS_WEBHOOK_ALLOW_PRIVATE;
    try {
      const outcome = await attemptDelivery(
        { url: `http://127.0.0.1:${port}/hook`, secret: "s" },
        delivery,
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/https/);
    } finally {
      process.env.STACKS_WEBHOOK_ALLOW_PRIVATE = "1";
    }
  });
});
