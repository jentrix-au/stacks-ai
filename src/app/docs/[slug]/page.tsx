import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocMarkdown } from "@/components/docs/doc-markdown";
import { DOCS, docBySlug, loadDocSource } from "@/lib/docs";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const doc = docBySlug((await params).slug);
  if (!doc) return {};
  return { title: doc.title, description: doc.description };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = docBySlug((await params).slug);
  if (!doc) notFound();
  const source = await loadDocSource(doc.file);

  const index = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];

  return (
    <>
      <DocMarkdown source={source} />
      <nav className="border-border mt-12 flex justify-between gap-4 border-t pt-6 text-sm">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="text-muted-foreground hover:text-foreground"
          >
            ← {prev.title}
          </Link>
        ) : (
          <Link
            href="/docs"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Overview
          </Link>
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="text-muted-foreground hover:text-foreground text-right"
          >
            {next.title} →
          </Link>
        ) : null}
      </nav>
    </>
  );
}
