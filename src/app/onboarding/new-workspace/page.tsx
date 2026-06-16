import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspace } from "@/server/actions/workspaces";

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create a workspace
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Workspaces hold all your boards. You can create more later and invite
          teammates to collaborate.
        </p>

        <form
          action={createWorkspace}
          className="border-border bg-card mt-8 flex flex-col gap-4 rounded-xl border p-5"
        >
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              name="name"
              autoFocus
              required
              maxLength={80}
              placeholder="Acme Inc."
            />
          </div>
          <Button type="submit">
            <Loader2 className="hidden size-3.5 animate-spin [&[data-loading]]:inline-block" />
            Create workspace
          </Button>
        </form>
      </div>
    </main>
  );
}
