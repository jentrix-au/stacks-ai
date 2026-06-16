"use client";

import { Role } from "@/lib/enums";
import { Copy, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSyncedTransition } from "@/components/sync";
import {
  changeRole,
  removeMember,
  resendInvitation,
  revokeInvitation,
} from "@/server/actions/workspaces";
import { format } from "date-fns";

type Member = {
  id: string;
  role: Role;
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

export function MembersTable({
  workspaceId,
  currentUserId,
  members,
  invitations,
  myRole,
}: {
  workspaceId: string;
  currentUserId: string;
  members: Member[];
  invitations: Invitation[];
  myRole: Role;
}) {
  const { run } = useSyncedTransition();
  const canManage = myRole === Role.OWNER || myRole === Role.ADMIN;
  const canChangeRoles = myRole === Role.OWNER;

  function runAction(label: string, fn: () => Promise<void>) {
    return run(label, fn);
  }

  async function handleResend(invitationId: string) {
    const fd = new FormData();
    fd.set("invitationId", invitationId);
    const result = await run("resend-invitation", () => resendInvitation(fd));
    if (result === null) return;
    if (result.emailSent) {
      toast.success("Invitation resent");
    } else {
      toast.warning(
        result.emailError
          ? `Invite refreshed, but email failed: ${result.emailError}`
          : "Invite refreshed. Email service is not configured — copy the link to share.",
      );
    }
  }

  function handleCopyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Invitation link copied"))
      .catch(() => toast.error("Couldn't copy link"));
  }

  return (
    <div className="border-border mt-3 overflow-hidden rounded-xl border">
      <ul className="divide-border divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-8">
              {m.user.image && <AvatarImage src={m.user.image} alt="" />}
              <AvatarFallback className="text-xs">
                {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.user.name ?? "—"}
                {m.user.id === currentUserId && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    (you)
                  </span>
                )}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {m.user.email}
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {m.role}
            </Badge>
            <span className="text-muted-foreground hidden text-xs sm:block">
              Joined {format(m.joinedAt, "MMM d, yyyy")}
            </span>
            {canManage && m.user.id !== currentUserId && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Actions"
                    />
                  }
                >
                  <MoreHorizontal className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canChangeRoles && (
                    <>
                      {(Object.values(Role) as Role[])
                        .filter((r) => r !== m.role)
                        .map((r) => (
                          <DropdownMenuItem
                            key={r}
                            onClick={() =>
                              runAction("change-role", async () => {
                                const fd = new FormData();
                                fd.set("workspaceId", workspaceId);
                                fd.set("memberUserId", m.user.id);
                                fd.set("role", r);
                                await changeRole(fd);
                              })
                            }
                          >
                            Set as {r.toLowerCase()}
                          </DropdownMenuItem>
                        ))}
                    </>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      runAction("remove-member", async () => {
                        const fd = new FormData();
                        fd.set("workspaceId", workspaceId);
                        fd.set("memberUserId", m.user.id);
                        await removeMember(fd);
                      })
                    }
                  >
                    Remove member
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      {invitations.length > 0 && (
        <>
          <div className="border-border bg-muted/40 text-muted-foreground border-t px-4 py-2 text-xs font-medium tracking-wide uppercase">
            Pending invites
          </div>
          <ul className="divide-border divide-y">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="bg-muted text-muted-foreground size-8 rounded-full text-center text-xs leading-8">
                  ?
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{inv.email}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    Expires {format(inv.expiresAt, "MMM d")} · token{" "}
                    <code className="font-mono text-[10px]">
                      {inv.token.slice(0, 8)}
                    </code>
                  </div>
                </div>
                <Badge variant="outline">{inv.role}</Badge>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Invitation actions"
                        />
                      }
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleResend(inv.id)}>
                        <RotateCw className="size-3.5" />
                        Resend invitation
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleCopyLink(inv.token)}
                      >
                        <Copy className="size-3.5" />
                        Copy invitation link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          runAction("revoke-invitation", async () => {
                            const fd = new FormData();
                            fd.set("invitationId", inv.id);
                            await revokeInvitation(fd);
                            toast.success("Invitation revoked");
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Revoke invitation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
