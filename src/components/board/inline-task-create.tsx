"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { createTask } from "@/server/actions/tasks";
import { updateDeal, setDealContacts } from "@/server/actions/deals";
import { updateTicket, linkTicketContact } from "@/server/actions/tickets";
import { updateBugReport } from "@/server/actions/bugs";
import { updateInitiative } from "@/server/actions/initiatives";
import { BoardKind, BugSeverity, TicketSeverity } from "@/lib/enums";
import type { FullTask } from "@/server/queries/boards";
import type { WorkspaceContactSummary } from "./board-client";

const fieldCls =
  "border-input bg-transparent h-7 min-w-0 flex-1 rounded-md border px-1.5 text-xs";

/** Next four quarters starting from the current one, "2026-Q3"-style. */
function quarterOptions(now = new Date()): string[] {
  const out: string[] = [];
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 4; i++) {
    out.push(`${year}-Q${q}`);
    q += 1;
    if (q > 4) {
      q = 1;
      year += 1;
    }
  }
  return out;
}

export function InlineTaskCreate({
  columnId,
  boardKind = BoardKind.TASKS,
  contacts = [],
  hotkeyTarget = false,
  onCreated,
}: {
  columnId: string;
  boardKind?: BoardKind;
  contacts?: WorkspaceContactSummary[];
  hotkeyTarget?: boolean;
  onCreated: (task: FullTask) => void;
}) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  // Per-kind quick-create fields (P3.9). Applied to the auto-created
  // sidecar right after the task lands.
  const [amount, setAmount] = useState("");
  const [contactId, setContactId] = useState("");
  const [severity, setSeverity] = useState("");
  const [version, setVersion] = useState("");
  const [quarter, setQuarter] = useState("");
  const { isPending, run } = useSyncedTransition();

  useEffect(() => {
    if (!hotkeyTarget) return;
    function onEvent() {
      setActive(true);
    }
    window.addEventListener("stacks:new-task", onEvent);
    return () => window.removeEventListener("stacks:new-task", onEvent);
  }, [hotkeyTarget]);

  function resetFields() {
    setTitle("");
    setAmount("");
    setContactId("");
    setSeverity("");
    setVersion("");
    setQuarter("");
  }

  /** Push the quick fields into the freshly created sidecar. */
  async function applyQuickFields(taskId: string): Promise<void> {
    if (boardKind === BoardKind.CRM) {
      const value = Number.parseFloat(amount);
      if (amount && Number.isFinite(value) && value >= 0) {
        await updateDeal({ taskId, amount: value });
      }
      if (contactId) await setDealContacts({ taskId, contactIds: [contactId] });
    } else if (boardKind === BoardKind.SUPPORT) {
      if (severity)
        await updateTicket({ taskId, severity: severity as TicketSeverity });
      if (contactId) await linkTicketContact({ taskId, contactId });
    } else if (boardKind === BoardKind.BUGS) {
      if (severity || version) {
        await updateBugReport({
          taskId,
          ...(severity ? { severity: severity as BugSeverity } : {}),
          ...(version ? { affectedVersion: version } : {}),
        });
      }
    } else if (boardKind === BoardKind.ROADMAP) {
      if (quarter) await updateInitiative({ taskId, targetQuarter: quarter });
    }
  }

  async function submit() {
    const value = title.trim();
    if (!value) {
      setActive(false);
      return;
    }
    const fd = new FormData();
    fd.set("columnId", columnId);
    fd.set("title", value);
    const result = await run("create-task", async () => {
      const created = await createTask(fd);
      await applyQuickFields(created.id);
      return created;
    });
    if (!result) return;
    onCreated({
      id: result.id,
      number: result.number,
      columnId,
      title: value,
      description: null,
      position: Number.MAX_SAFE_INTEGER,
      priority: "MEDIUM",
      dueAt: null,
      createdById: "",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      labels: [],
      assignees: [],
      subtasks: [],
      deal: null,
      bugReport: null,
      ticket: null,
      initiative: null,
      outgoingLinks: [],
      incomingLinks: [],
      _count: { comments: 0, attachments: 0 },
    } as unknown as FullTask);
    resetFields();
    setActive(false);
  }

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground w-full justify-start"
        onClick={() => setActive(true)}
      >
        <Plus className="size-3.5" />
        Add task
      </Button>
    );
  }

  const contactSelect = (
    <select
      aria-label="Contact"
      className={fieldCls}
      value={contactId}
      onChange={(e) => setContactId(e.target.value)}
      disabled={isPending}
    >
      <option value="">Contact…</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="border-border bg-card flex flex-col gap-1.5 rounded-md border p-1.5">
      <Textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            resetFields();
            setActive(false);
          }
        }}
        placeholder="Task title"
        rows={2}
        disabled={isPending}
        className="resize-none border-none bg-transparent px-1 py-0.5 text-[13px] shadow-none focus-visible:ring-0"
      />

      {/* Per-kind quick fields (P3.9) */}
      {boardKind === BoardKind.CRM && (
        <div className="flex items-center gap-1.5">
          <input
            aria-label="Deal amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            className={fieldCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
          {contactSelect}
        </div>
      )}
      {boardKind === BoardKind.SUPPORT && (
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Ticket severity"
            className={fieldCls}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={isPending}
          >
            <option value="">Severity…</option>
            {Object.values(TicketSeverity).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          {contactSelect}
        </div>
      )}
      {boardKind === BoardKind.BUGS && (
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Bug severity"
            className={fieldCls}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={isPending}
          >
            <option value="">Severity…</option>
            {Object.values(BugSeverity).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <input
            aria-label="Affected version"
            placeholder="Version"
            className={fieldCls}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={isPending}
          />
        </div>
      )}
      {boardKind === BoardKind.ROADMAP && (
        <select
          aria-label="Target quarter"
          className={fieldCls}
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          disabled={isPending}
        >
          <option value="">Quarter…</option>
          {quarterOptions().map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={submit}
          loading={isPending}
          loadingText="Adding…"
        >
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            resetFields();
            setActive(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
