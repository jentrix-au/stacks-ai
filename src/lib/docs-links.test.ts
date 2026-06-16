import { readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DOCS, DOCS_INDEX_FILE, loadDocSource } from "./docs";
import { rewriteDocHref } from "./docs-links";

describe("rewriteDocHref", () => {
  it("maps sibling doc links to /docs routes, keeping anchors", () => {
    expect(rewriteDocHref("./user-guide.md")).toEqual({
      href: "/docs/user-guide",
      external: false,
    });
    expect(rewriteDocHref("agents-setup.md#hosting-variants")).toEqual({
      href: "/docs/agents-setup#hosting-variants",
      external: false,
    });
  });

  it("maps the docs README to the index route", () => {
    expect(rewriteDocHref("./README.md")).toEqual({
      href: "/docs",
      external: false,
    });
  });

  it("sends repo-relative links to GitHub", () => {
    const { href, external } = rewriteDocHref("../agents/README.md");
    expect(external).toBe(true);
    expect(href).toBe(
      "https://github.com/jentrix-au/task-manager/blob/main/agents/README.md",
    );
  });

  it("passes through anchors and absolute URLs", () => {
    expect(rewriteDocHref("#core-concepts")).toEqual({
      href: "#core-concepts",
      external: false,
    });
    expect(rewriteDocHref("https://neon.tech")).toEqual({
      href: "https://neon.tech",
      external: true,
    });
    expect(rewriteDocHref("mailto:hi@example.com").external).toBe(true);
  });
});

describe("docs manifest", () => {
  it("stays in sync with the docs/ directory", async () => {
    const files = (await readdir(path.join(process.cwd(), "docs")))
      .filter((f) => f.endsWith(".md"))
      .sort();
    const manifest = [...DOCS.map((d) => d.file), DOCS_INDEX_FILE].sort();
    expect(files).toEqual(manifest);
  });

  it("every internal .md link in the docs resolves to a manifest entry", async () => {
    const validTargets = new Set([
      "/docs",
      ...DOCS.map((d) => `/docs/${d.slug}`),
    ]);
    for (const file of [DOCS_INDEX_FILE, ...DOCS.map((d) => d.file)]) {
      const source = await loadDocSource(file);
      for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
        const { href, external } = rewriteDocHref(match[1]);
        if (external || href.startsWith("#")) continue;
        expect(validTargets, `${file}: ${match[1]}`).toContain(
          href.split("#")[0],
        );
      }
    }
  });
});
