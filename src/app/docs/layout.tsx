import type { Metadata } from "next";
import Link from "next/link";

import { DocsNav, type DocsNavItem } from "@/components/docs/docs-nav";
import { buttonVariants } from "@/components/ui/button";
import { DOCS } from "@/lib/docs";

export const metadata: Metadata = {
  title: { template: "%s · Stacks docs", default: "Stacks docs" },
  description:
    "Stacks documentation: user guide, agent platform reference, and deployment.",
};

const NAV_ITEMS: DocsNavItem[] = [
  { href: "/docs", title: "Overview" },
  ...DOCS.map((d) => ({ href: `/docs/${d.slug}`, title: d.title })),
];

export default function DocsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border/60 bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Stacks
          </Link>
          <span className="text-muted-foreground/60 text-sm">/</span>
          <Link href="/docs" className="text-muted-foreground text-sm">
            Docs
          </Link>
          <div className="ml-auto">
            <Link
              href="/login"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Open app
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-8">
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-22">
            <DocsNav items={NAV_ITEMS} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="-mx-1 mb-6 overflow-x-auto lg:hidden">
            <DocsNav
              items={NAV_ITEMS}
              className="w-max flex-row gap-1 px-1 whitespace-nowrap"
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
