"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CopyIcon, PlusIcon, TrashIcon, WebhookIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import {
  createWebhook,
  deleteWebhook,
} from "@/server/actions/webhooks";

export interface WebhookSummary {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  consecutiveFailures: number;
  createdAt: string;
}

export function WebhooksSection({
  workspaceId,
  webhooks,
}: {
  workspaceId: string;
  webhooks: WebhookSummary[];
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const { isPending, run } = useSyncedTransition();

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventList = events
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const created = await run("create-webhook", () =>
      createWebhook({
        workspaceId,
        url: url.trim(),
        // Empty = all events. Server-side Zod validates names.
        events: eventList as Parameters<typeof createWebhook>[0]["events"],
      }),
    );
    if (!created) return;
    setCreatedSecret(created.secret);
    setUrl("");
    setEvents("");
    toast.success("Webhook created — copy the signing secret now");
  };

  const onDelete = async (webhookId: string, webhookUrl: string) => {
    if (!confirm(`Delete the webhook for ${webhookUrl}?`)) return;
    const result = await run("delete-webhook", async () => {
      await deleteWebhook({ webhookId });
      return true;
    });
    if (result) toast.success("Webhook deleted");
  };

  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg font-medium">Webhooks</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        HMAC-signed POSTs for board events (task.created, comment.created, …).
        Failed deliveries retry with backoff for up to 8 attempts; 3 exhausted
        deliveries in a row disable the webhook.
      </p>

      {createdSecret ? (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Signing secret — shown once, store it now:
          </p>
          <div className="mt-2 flex items-center gap-2 font-mono break-all">
            <span className="flex-1">{createdSecret}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy secret"
              onClick={async () => {
                await navigator.clipboard.writeText(createdSecret);
                toast.success("Secret copied");
              }}
            >
              <CopyIcon />
            </Button>
          </div>
        </div>
      ) : null}

      {webhooks.length === 0 ? (
        <div className="bg-muted/30 text-muted-foreground mt-4 rounded-lg border border-dashed p-6 text-center text-sm">
          No webhooks yet.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {webhooks.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <WebhookIcon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{w.url}</p>
                <p className="text-muted-foreground text-xs">
                  {w.events.length === 0
                    ? "All events"
                    : w.events.join(", ")}
                </p>
              </div>
              {w.active ? (
                <Badge variant="secondary">Active</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                  title="Disabled after repeated delivery failures. Delete and recreate to re-enable."
                >
                  Disabled
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete webhook"
                loading={isPending}
                onClick={() => onDelete(w.id, w.url)}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-url">Endpoint URL (https)</Label>
          <Input
            id="webhook-url"
            type="url"
            placeholder="https://example.com/stacks-webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-events">
            Events (comma-separated, empty = all)
          </Label>
          <Input
            id="webhook-events"
            placeholder="task.created, task.moved, comment.created"
            value={events}
            onChange={(e) => setEvents(e.target.value)}
          />
        </div>
        <div>
          <Button
            type="submit"
            disabled={!url.trim()}
            loading={isPending}
            loadingText="Creating…"
          >
            <PlusIcon />
            Add webhook
          </Button>
        </div>
      </form>
    </section>
  );
}
