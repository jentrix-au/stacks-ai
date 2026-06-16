"use client";

import { useRouter } from "next/navigation";
import { LogOut, MonitorCog, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncedTransition } from "@/components/sync";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOutAction } from "@/server/auth/sign-out";

export function UserMenu({
  user,
}: {
  user: { name: string | null; email: string | null; image: string | null };
}) {
  const router = useRouter();
  const { run } = useSyncedTransition();
  const { theme, setTheme } = useTheme();
  const initials = (user.name ?? user.email ?? "?")
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="ring-offset-background focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
            aria-label="Account menu"
          />
        }
      >
        <Avatar className="size-7">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm">{user.name ?? "—"}</span>
            {user.email && (
              <span className="text-muted-foreground truncate text-xs font-normal">
                {user.email}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? (
              <Moon className="size-3.5" />
            ) : theme === "light" ? (
              <Sun className="size-3.5" />
            ) : (
              <MonitorCog className="size-3.5" />
            )}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="size-3.5" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="size-3.5" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <MonitorCog className="size-3.5" /> System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={() => router.push("/account")}>
          <User className="size-3.5" /> Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => run("sign-out", () => signOutAction())}
        >
          <LogOut className="size-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
