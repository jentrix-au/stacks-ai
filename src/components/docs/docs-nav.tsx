"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface DocsNavItem {
  href: string;
  title: string;
}

export function DocsNav({
  items,
  className,
}: {
  items: DocsNavItem[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Documentation"
      className={cn("flex flex-col gap-0.5", className)}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
