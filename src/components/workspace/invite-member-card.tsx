"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Role } from "@/lib/enums";
import { toast } from "sonner";
import { useSyncedTransition } from "@/components/sync";
import { inviteMember } from "@/server/actions/workspaces";

export function InviteMemberCard({ workspaceId }: { workspaceId: string }) {
  const { isPending, run } = useSyncedTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("workspaceId", workspaceId);
    const result = await run("invite-member", () => inviteMember(formData));
    if (result === null) return;
    if (result.emailSent) {
      toast.success("Invitation sent");
    } else {
      toast.warning(
        result.emailError
          ? `Invite created, but email failed: ${result.emailError}`
          : "Invite created. Email service is not configured — share the link from the pending list.",
      );
    }
    const form = document.getElementById(
      "invite-form",
    ) as HTMLFormElement | null;
    form?.reset();
  }

  return (
    <form
      id="invite-form"
      action={handleSubmit}
      className="border-border bg-card flex flex-wrap items-end gap-3 rounded-xl border p-4"
    >
      <fieldset disabled={isPending} className="contents disabled:opacity-100">
        <div className="min-w-[240px] flex-1">
          <Label htmlFor="invite-email">Invite by email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="invite-role">Role</Label>
          <Select name="role" defaultValue={Role.MEMBER}>
            <SelectTrigger id="invite-role" className="mt-1.5 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={Role.MEMBER}>Member</SelectItem>
              <SelectItem value={Role.ADMIN}>Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" loading={isPending} loadingText="Sending…">
          <Send className="size-3.5" />
          Send invite
        </Button>
      </fieldset>
    </form>
  );
}
