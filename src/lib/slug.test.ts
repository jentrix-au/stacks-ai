import { describe, expect, it } from "vitest";

import { slugify, taskPrefixFromSlug } from "./slug";

describe("taskPrefixFromSlug", () => {
  it("uppercases the first three alphanumeric chars", () => {
    expect(taskPrefixFromSlug("demo")).toBe("DEM");
    expect(taskPrefixFromSlug("stacks")).toBe("STA");
    expect(taskPrefixFromSlug("acme-inc")).toBe("ACM");
  });

  it("skips separators when collecting chars", () => {
    expect(taskPrefixFromSlug("a-b-c-d")).toBe("ABC");
    expect(taskPrefixFromSlug("x_y")).toBe("XY");
  });

  it("keeps digits", () => {
    expect(taskPrefixFromSlug("42-tasks")).toBe("42T");
  });

  it("handles short slugs", () => {
    expect(taskPrefixFromSlug("io")).toBe("IO");
    expect(taskPrefixFromSlug("x")).toBe("X");
  });

  it("falls back to WS for degenerate slugs", () => {
    expect(taskPrefixFromSlug("")).toBe("WS");
    expect(taskPrefixFromSlug("---")).toBe("WS");
  });

  it("composes with slugify for non-latin names", () => {
    // slugify strips non-latin chars entirely; the prefix falls back.
    expect(taskPrefixFromSlug(slugify("Проект"))).toBe("WS");
  });
});
