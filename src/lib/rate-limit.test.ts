import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("./db", () => ({
  db: { apiTokenRateLimit: { upsert } },
}));

import {
  currentMinuteBucket,
  enforceRateLimit,
  RateLimitError,
  REQUESTS_PER_MINUTE,
  secondsUntilNextMinute,
} from "./rate-limit";

describe("currentMinuteBucket", () => {
  it("formats a UTC minute key", () => {
    expect(currentMinuteBucket(new Date("2026-06-12T10:15:30Z"))).toBe(
      "minute:2026-06-12T10:15",
    );
  });

  it("is stable within the same minute", () => {
    expect(currentMinuteBucket(new Date("2026-06-12T10:15:00Z"))).toBe(
      currentMinuteBucket(new Date("2026-06-12T10:15:59.999Z")),
    );
  });

  it("rolls over at the minute boundary", () => {
    expect(currentMinuteBucket(new Date("2026-06-12T10:15:59.999Z"))).not.toBe(
      currentMinuteBucket(new Date("2026-06-12T10:16:00Z")),
    );
  });

  it("zero-pads month, day, hour, and minute", () => {
    expect(currentMinuteBucket(new Date("2026-01-02T03:04:05Z"))).toBe(
      "minute:2026-01-02T03:04",
    );
  });
});

describe("secondsUntilNextMinute", () => {
  it("counts down within the minute", () => {
    expect(secondsUntilNextMinute(new Date("2026-06-12T10:15:30Z"))).toBe(30);
    expect(secondsUntilNextMinute(new Date("2026-06-12T10:15:59Z"))).toBe(1);
    expect(secondsUntilNextMinute(new Date("2026-06-12T10:15:00Z"))).toBe(60);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it("increments atomically via a single upsert and checks the returned count", async () => {
    upsert.mockResolvedValue({ count: 1 });
    await enforceRateLimit("tok_1", new Date("2026-06-12T10:15:30Z"));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        tokenId_bucket: {
          tokenId: "tok_1",
          bucket: "minute:2026-06-12T10:15",
        },
      },
      create: {
        tokenId: "tok_1",
        bucket: "minute:2026-06-12T10:15",
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
  });

  it("allows exactly the limit", async () => {
    upsert.mockResolvedValue({ count: REQUESTS_PER_MINUTE });
    await expect(
      enforceRateLimit("tok_1", new Date("2026-06-12T10:15:30Z")),
    ).resolves.toBeUndefined();
  });

  it("throws RateLimitError with retryAfterSeconds when over the limit", async () => {
    upsert.mockResolvedValue({ count: REQUESTS_PER_MINUTE + 1 });
    const promise = enforceRateLimit("tok_1", new Date("2026-06-12T10:15:42Z"));
    await expect(promise).rejects.toBeInstanceOf(RateLimitError);
    await promise.catch((e: RateLimitError) => {
      expect(e.status).toBe(429);
      expect(e.retryAfterSeconds).toBe(18);
      expect(e.message).toContain(`${REQUESTS_PER_MINUTE} requests/min`);
    });
  });
});
