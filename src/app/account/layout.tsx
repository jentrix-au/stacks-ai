import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ChevronLeftIcon } from "lucide-react";

import { AccountNav } from "@/components/account/account-nav";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
          >
            <ChevronLeftIcon className="size-4" />
            Back to workspaces
          </Link>
          <div className="text-muted-foreground ml-auto text-sm">
            {session.user.email}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6">
          <AccountNav />
        </div>
        {children}
      </main>
    </div>
  );
}
