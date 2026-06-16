import { beforeEach, describe, expect, it, vi } from "vitest";

const { userCount, userUpdate } = vi.hoisted(() => ({
  userCount: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { count: userCount, update: userUpdate },
  },
}));

import { markInstanceAdminIfFirst } from "./first-user";

describe("markInstanceAdminIfFirst", () => {
  beforeEach(() => {
    userCount.mockReset();
    userUpdate.mockReset().mockResolvedValue({});
  });

  it("promotes the only user (count === 1) to instance admin", async () => {
    userCount.mockResolvedValue(1);
    await markInstanceAdminIfFirst("user_1");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { isAdmin: true },
    });
  });

  it("does nothing once other users already exist", async () => {
    userCount.mockResolvedValue(2);
    await markInstanceAdminIfFirst("user_2");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when the count is zero (defensive)", async () => {
    userCount.mockResolvedValue(0);
    await markInstanceAdminIfFirst("user_x");
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
