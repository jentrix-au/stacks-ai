/**
 * Pure link rewriting for markdown rendered from docs/*.md. The files are
 * written to read naturally on GitHub (relative .md links); when rendered
 * in-app at /docs those links must point at the app routes instead.
 */

const REPO_BLOB_URL = "https://github.com/jentrix-au/task-manager/blob/main";

const RELATIVE_DOC = /^([a-z0-9-]+)\.md(#.*)?$/;

export interface RewrittenLink {
  href: string;
  external: boolean;
}

export function rewriteDocHref(href: string | undefined): RewrittenLink {
  if (!href) return { href: "#", external: false };
  // In-page anchors and absolute URLs pass through.
  if (href.startsWith("#")) return { href, external: false };
  if (/^[a-z][a-z+.-]*:/i.test(href)) return { href, external: true };

  const cleaned = href.replace(/^\.\//, "");

  // Links escaping docs/ (../agents/README.md, ../CLAUDE.md) target the repo.
  if (cleaned.startsWith("../")) {
    return {
      href: `${REPO_BLOB_URL}/${cleaned.replace(/^(\.\.\/)+/, "")}`,
      external: true,
    };
  }

  // docs/README.md is the index page.
  if (cleaned === "README.md" || cleaned.startsWith("README.md#")) {
    return {
      href: `/docs${cleaned.slice("README.md".length)}`,
      external: false,
    };
  }

  const doc = RELATIVE_DOC.exec(cleaned);
  if (doc) return { href: `/docs/${doc[1]}${doc[2] ?? ""}`, external: false };

  return { href, external: false };
}
