"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pending, useSyncedTransition } from "@/components/sync";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AgentBadge } from "@/components/board/agent-badge";
import {
  createComment,
  deleteComment,
  listComments,
} from "@/server/actions/comments";
import type { WorkspaceMember } from "./board-client";

type Comment = Awaited<ReturnType<typeof listComments>>[number];

/** "@quer" right before the caret → "quer"; null when not mentioning. */
function mentionQueryAt(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  return match ? match[2] : null;
}

export function CommentThread({
  taskId,
  currentUserId,
  members = [],
}: {
  taskId: string;
  currentUserId: string | null;
  members?: WorkspaceMember[];
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [recentId, setRecentId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set(),
  );
  // @mention autocomplete (P3.3): query under the caret, highlighted row,
  // and the id of every mention picked so far (label → id; resolved against
  // the final body at submit so deleted mentions drop out).
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const pickedMentions = useRef(new Map<string, string>()); // label → userId
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submitTx = useSyncedTransition();

  const mentionCandidates =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.id !== currentUserId)
          .filter((m) => {
            const q = mentionQuery.toLowerCase();
            if (!q) return true;
            return (
              (m.name ?? "").toLowerCase().includes(q) ||
              (m.email ?? "").toLowerCase().includes(q)
            );
          })
          .slice(0, 5);

  function syncMentionState(el: HTMLTextAreaElement) {
    const q = mentionQueryAt(el.value, el.selectionStart ?? el.value.length);
    setMentionQuery(q);
    setMentionIndex(0);
  }

  function pickMention(member: WorkspaceMember) {
    const el = textareaRef.current;
    if (!el || mentionQuery === null) return;
    const caret = el.selectionStart ?? el.value.length;
    const label = `@${member.name ?? member.email ?? member.id}`;
    const start = caret - mentionQuery.length - 1; // include the "@"
    const next = el.value.slice(0, start) + label + " " + el.value.slice(caret);
    pickedMentions.current.set(label, member.id);
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + label.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  useEffect(() => {
    let alive = true;
    listComments(taskId)
      .then((data) => {
        if (alive) setComments(data);
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Could not load comments",
        );
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!recentId) return;
    const t = setTimeout(() => setRecentId(null), 700);
    return () => clearTimeout(t);
  }, [recentId]);

  async function submit() {
    const value = body.trim();
    if (!value) return;
    // Only mentions whose "@Label" survived editing are sent.
    const mentions = [
      ...new Set(
        [...pickedMentions.current.entries()]
          .filter(([label]) => value.includes(label))
          .map(([, id]) => id),
      ),
    ];
    const ok = await submitTx.run("create-comment", () =>
      createComment({
        taskId,
        body: value,
        ...(mentions.length > 0 ? { mentions } : {}),
      }),
    );
    if (ok === null) return;
    setBody("");
    pickedMentions.current.clear();
    setMentionQuery(null);
    const fresh = await listComments(taskId);
    setComments(fresh);
    const justAdded = fresh.find((c) => !comments?.some((p) => p.id === c.id));
    if (justAdded) setRecentId(justAdded.id);
  }

  function handleDelete(commentId: string) {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(commentId);
      return next;
    });
    submitTx
      .run("delete-comment", () => deleteComment({ commentId }))
      .then((ok) => {
        if (ok !== null) {
          setComments((c) => c?.filter((x) => x.id !== commentId) ?? null);
        }
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {comments === null ? (
          <li className="text-muted-foreground text-xs">Loading…</li>
        ) : comments.length === 0 ? (
          <li className="text-muted-foreground text-xs">No comments yet.</li>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {comments.map((c) => {
              const isDeleting = pendingDeleteIds.has(c.id);
              return (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    marginTop: 0,
                    marginBottom: 0,
                  }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "flex gap-2",
                    c.id === recentId && "animate-saved-pulse-bg rounded-md",
                    isDeleting && "pointer-events-none opacity-60",
                  )}
                  aria-busy={isDeleting || undefined}
                >
                  <Avatar className="size-6">
                    {c.author.image && (
                      <AvatarImage src={c.author.image} alt="" />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {(c.author.name ?? c.author.email ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium">
                        {c.author.name ?? c.author.email}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                        {c.editedAt && " (edited)"}
                      </span>
                      {c.viaAgent ? (
                        <AgentBadge
                          name={c.viaAgent.name}
                          emoji={c.viaAgent.emoji}
                        />
                      ) : null}
                      {c.author.id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={isDeleting}
                          className="text-muted-foreground hover:text-destructive ml-auto disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        )}
      </ul>

      <Pending isPending={submitTx.isPending} className="block w-full">
        <div className="border-border bg-card relative w-full rounded-lg border p-2">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              syncMentionState(e.target);
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionCandidates.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionCandidates.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex(
                    (i) =>
                      (i - 1 + mentionCandidates.length) %
                      mentionCandidates.length,
                  );
                  return;
                }
                if (
                  (e.key === "Enter" || e.key === "Tab") &&
                  !e.metaKey &&
                  !e.ctrlKey
                ) {
                  e.preventDefault();
                  pickMention(mentionCandidates[mentionIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionQuery(null);
                  return;
                }
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            onClick={(e) => syncMentionState(e.currentTarget)}
            onBlur={() => {
              // Delay so a click on a candidate registers before the list
              // unmounts.
              setTimeout(() => setMentionQuery(null), 150);
            }}
            rows={2}
            placeholder="Write a comment… @mention to notify (⌘+Enter to send)"
            className="resize-none border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
          {mentionQuery !== null && mentionCandidates.length > 0 && (
            <ul
              role="listbox"
              aria-label="Mention a member"
              className="border-border bg-popover absolute right-2 left-2 z-10 mt-1 overflow-hidden rounded-md border shadow-md"
            >
              {mentionCandidates.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === mentionIndex}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focus
                      pickMention(m);
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                      i === mentionIndex && "bg-muted",
                    )}
                  >
                    <Avatar className="size-5">
                      {m.image && <AvatarImage src={m.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{m.name ?? m.email}</span>
                    {m.name && m.email && (
                      <span className="text-muted-foreground ml-auto truncate text-xs">
                        {m.email}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={!body.trim()}
              loading={submitTx.isPending}
              loadingText="Posting…"
            >
              <Send className="size-3" />
              Comment
            </Button>
          </div>
        </div>
      </Pending>
    </div>
  );
}
