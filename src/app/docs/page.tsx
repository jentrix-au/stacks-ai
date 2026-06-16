import { DocMarkdown } from "@/components/docs/doc-markdown";
import { DOCS_INDEX_FILE, loadDocSource } from "@/lib/docs";

// Statically generated at build time — the markdown is read from docs/
// during prerender, so no filesystem access happens at runtime.
export const dynamic = "force-static";

export default async function DocsIndexPage() {
  const source = await loadDocSource(DOCS_INDEX_FILE);
  return <DocMarkdown source={source} />;
}
