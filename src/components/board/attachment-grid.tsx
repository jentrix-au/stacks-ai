"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { toast } from "sonner";
import { uploadAttachment } from "@/lib/upload";
import { removeAttachment } from "@/server/actions/attachments";
import { fetchTaskAttachments } from "@/server/actions/attachments-list";
import type { TaskAttachment } from "@/server/queries/attachments";

interface UploadState {
  id: string;
  name: string;
  progress: "uploading" | "error";
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentGrid({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string | null;
}) {
  const [items, setItems] = useState<TaskAttachment[] | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const deleteTx = useSyncedTransition();

  useEffect(() => {
    let alive = true;
    fetchTaskAttachments(taskId)
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Could not load attachments",
        );
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    for (const file of list) {
      const tmp: UploadState = {
        id: `tmp-${Date.now()}-${Math.random()}`,
        name: file.name,
        progress: "uploading",
      };
      setUploads((u) => [...u, tmp]);
      try {
        await uploadAttachment(taskId, file);
        const fresh = await fetchTaskAttachments(taskId);
        setItems(fresh);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
        setUploads((u) =>
          u.map((x) => (x.id === tmp.id ? { ...x, progress: "error" } : x)),
        );
        continue;
      } finally {
        setUploads((u) => u.filter((x) => x.id !== tmp.id));
      }
    }
  }

  function handleDelete(id: string) {
    setDeletingIds((p) => {
      const next = new Set(p);
      next.add(id);
      return next;
    });
    deleteTx
      .run("delete-attachment", () => removeAttachment({ attachmentId: id }))
      .then((ok) => {
        if (ok !== null) {
          setItems((curr) => curr?.filter((x) => x.id !== id) ?? null);
        }
        setDeletingIds((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  }

  const isEmpty = (items?.length ?? 0) === 0 && uploads.length === 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      className={cn(
        "border-border bg-card/30 rounded-lg border border-dashed transition-colors",
        dragOver && "border-primary bg-primary/5",
      )}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {isEmpty ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="text-muted-foreground hover:bg-muted/30 hover:text-foreground flex w-full flex-col items-center justify-center gap-1.5 px-4 py-6 text-center text-xs transition-colors"
        >
          <Upload className="size-4" />
          <span>
            <span className="font-medium">Click to upload</span> · drag &amp;
            drop · paste an image
          </span>
        </button>
      ) : (
        <div className="space-y-3 p-3">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
            <AnimatePresence initial={false}>
              {uploads.map((u) => (
                <motion.li
                  key={u.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="border-border bg-muted/40 text-muted-foreground flex aspect-video items-center justify-center rounded-md border border-dashed text-[11px]"
                >
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" />
                    {u.name}
                  </span>
                </motion.li>
              ))}
              {items?.map((a) => {
                const isImage = a.mimeType.startsWith("image/");
                const canDelete = a.uploaderId === currentUserId;
                const isDeleting = deletingIds.has(a.id);
                return (
                  <motion.li
                    key={a.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className={cn(
                      "group border-border bg-muted/30 relative overflow-hidden rounded-md border transition-opacity",
                      isDeleting && "pointer-events-none opacity-60",
                    )}
                    aria-busy={isDeleting || undefined}
                  >
                    {isImage && a.url ? (
                      <button
                        type="button"
                        className="block w-full"
                        onClick={() => setLightbox(a)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt={a.name}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <a
                        href={a.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-video flex-col items-center justify-center gap-1 p-2 text-center"
                      >
                        <Paperclip className="text-muted-foreground size-4" />
                        <span className="line-clamp-2 text-[11px]">
                          {a.name}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {bytes(a.size)}
                        </span>
                      </a>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={isDeleting}
                        className="bg-background/80 hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 rounded p-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 disabled:opacity-50"
                        aria-label="Delete attachment"
                      >
                        {isDeleting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInput.current?.click()}
            className="text-muted-foreground w-full"
          >
            <Upload className="size-3" />
            Add more
          </Button>
        </div>
      )}

      <AnimatePresence>
        {lightbox && lightbox.url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
              className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="size-4" />
            </button>
            <motion.img
              src={lightbox.url}
              alt={lightbox.name}
              layoutId={`attachment-${lightbox.id}`}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
              {lightbox.name} · {format(lightbox.createdAt, "MMM d, yyyy")} ·{" "}
              {bytes(lightbox.size)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
