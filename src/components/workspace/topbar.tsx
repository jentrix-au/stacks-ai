import Link from "next/link";
import {
  Bell,
  ChartNoAxesColumn,
  Contact,
  ListTodo,
  Settings,
  Users,
} from "lucide-react";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { UserMenu } from "./user-menu";
import { CommandPaletteTrigger } from "@/components/common/command-palette-trigger";
import { buttonVariants } from "@/components/ui/button";
import { SyncBadge } from "@/components/sync";

interface TopBarProps {
  workspace: { id: string; name: string; slug: string };
  workspaces: { id: string; name: string; slug: string }[];
  user: { name: string | null; email: string | null; image: string | null };
  unreadNotifications?: number;
}

export function WorkspaceTopBar({
  workspace,
  workspaces,
  user,
  unreadNotifications = 0,
}: TopBarProps) {
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-12 items-center gap-2 border-b px-3 backdrop-blur">
      <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      <nav className="ml-2 hidden items-center gap-1 sm:flex">
        <Link
          href={`/${workspace.slug}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Boards
        </Link>
        <Link
          href={`/${workspace.slug}/my-work`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ListTodo className="size-3.5" />
          My Work
        </Link>
        <Link
          href={`/${workspace.slug}/dashboards`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ChartNoAxesColumn className="size-3.5" />
          Dashboards
        </Link>
        <Link
          href={`/${workspace.slug}/contacts`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Contact className="size-3.5" />
          People
        </Link>
        <Link
          href={`/${workspace.slug}/members`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Users className="size-3.5" />
          Members
        </Link>
        <Link
          href={`/${workspace.slug}/settings`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Settings className="size-3.5" />
          Settings
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SyncBadge className="mr-1" />
        <Link
          href={`/${workspace.slug}/inbox`}
          aria-label={
            unreadNotifications > 0
              ? `Notifications (${unreadNotifications} unread)`
              : "Notifications"
          }
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <span className="relative">
            <Bell className="size-4" />
            {unreadNotifications > 0 && (
              <span
                data-testid="unread-badge"
                className="bg-primary text-primary-foreground absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold"
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </span>
        </Link>
        <CommandPaletteTrigger
          workspace={{ id: workspace.id, slug: workspace.slug }}
        />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
