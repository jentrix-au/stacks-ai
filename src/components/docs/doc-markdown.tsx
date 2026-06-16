import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { rewriteDocHref } from "@/lib/docs-links";

function DocLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const { href: target, external } = rewriteDocHref(href);
  if (external) {
    return (
      <a href={target} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <Link href={target}>{children}</Link>;
}

/**
 * Renders a docs/*.md source. Server Component — markdown is parsed at
 * build time (the /docs routes are statically generated), so none of the
 * unified pipeline ships to the client.
 */
export function DocMarkdown({ source }: { source: string }) {
  return (
    <article
      className="prose prose-neutral dark:prose-invert prose-headings:scroll-mt-24 prose-pre:border prose-pre:border-border prose-code:before:content-none prose-code:after:content-none max-w-none"
      data-testid="doc-content"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{ a: DocLink }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
