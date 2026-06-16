import { describe, expect, it } from "vitest";

import { ManageColumnsSchema } from "@/server/columns/schemas";
import { ManageLabelsSchema } from "./schemas";

describe("ManageLabelsSchema per-action validation", () => {
  it("create requires boardId + name + color", () => {
    expect(
      ManageLabelsSchema.safeParse({
        action: "create",
        boardId: "b1",
        name: "bug",
        color: "#ef4444",
      }).success,
    ).toBe(true);
    const missing = ManageLabelsSchema.safeParse({ action: "create" });
    expect(missing.success).toBe(false);
    const paths = missing.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["boardId", "name", "color"]),
    );
  });

  it("update requires labelId and at least one field", () => {
    expect(
      ManageLabelsSchema.safeParse({
        action: "update",
        labelId: "l1",
        color: "#00ff00",
      }).success,
    ).toBe(true);
    expect(
      ManageLabelsSchema.safeParse({ action: "update", labelId: "l1" })
        .success,
    ).toBe(false);
    expect(
      ManageLabelsSchema.safeParse({ action: "update", name: "x" }).success,
    ).toBe(false);
  });

  it("delete requires labelId", () => {
    expect(
      ManageLabelsSchema.safeParse({ action: "delete", labelId: "l1" })
        .success,
    ).toBe(true);
    expect(ManageLabelsSchema.safeParse({ action: "delete" }).success).toBe(
      false,
    );
  });
});

describe("ManageColumnsSchema per-action validation", () => {
  it("create requires boardId + name", () => {
    expect(
      ManageColumnsSchema.safeParse({
        action: "create",
        boardId: "b1",
        name: "Done",
      }).success,
    ).toBe(true);
    expect(ManageColumnsSchema.safeParse({ action: "create" }).success).toBe(
      false,
    );
  });

  it("rename requires columnId + name", () => {
    expect(
      ManageColumnsSchema.safeParse({
        action: "rename",
        columnId: "c1",
        name: "QA",
      }).success,
    ).toBe(true);
    expect(
      ManageColumnsSchema.safeParse({ action: "rename", columnId: "c1" })
        .success,
    ).toBe(false);
  });

  it("move and archive require columnId only", () => {
    expect(
      ManageColumnsSchema.safeParse({
        action: "move",
        columnId: "c1",
        beforeColumnId: "c0",
      }).success,
    ).toBe(true);
    expect(
      ManageColumnsSchema.safeParse({ action: "archive", columnId: "c1" })
        .success,
    ).toBe(true);
    expect(ManageColumnsSchema.safeParse({ action: "move" }).success).toBe(
      false,
    );
  });
});
