import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas, newlines, and escaped quotes", () => {
    const text = 'name,notes\n"Reyes, Dana","said ""hi""\nthen left"';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Reyes, Dana", 'said "hi"\nthen left'],
    ]);
  });

  it("handles \\r\\n endings and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});

describe("toCsv", () => {
  it("escapes only when needed and round-trips", () => {
    const rows = [
      ["title", "desc"],
      ['has "quotes"', "multi\nline, with comma"],
      ["plain", ""],
    ];
    const text = toCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
    expect(text.split("\n")[0]).toBe("title,desc");
  });
});
