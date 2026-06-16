"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import { updateProfileAction } from "@/server/actions/profile";

export function ProfileForm({
  user,
}: {
  user: { name: string | null; email: string | null; image: string | null };
}) {
  const [name, setName] = useState(user.name ?? "");
  const { run, isPending } = useSyncedTransition();

  const initials = (user.name ?? user.email ?? "?")
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const trimmed = name.trim();
  const dirty = trimmed !== (user.name ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || !dirty) return;
    void run("update-profile", () => updateProfileAction({ name: trimmed }), {
      onSaved: () => toast.success("Profile updated"),
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="text-sm">{initials}</AvatarFallback>
        </Avatar>
        <p className="text-muted-foreground text-xs">
          Your picture comes from the provider you sign in with.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={user.email ?? ""} disabled />
        <p className="text-muted-foreground text-xs">
          Your email identifies you to sign-in providers and can&rsquo;t be
          changed here.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={!trimmed || !dirty || isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
