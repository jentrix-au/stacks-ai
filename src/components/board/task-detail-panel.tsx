"use client";

import { useState } from "react";
import { Priority, BoardKind } from "@/lib/enums";
import { Archive, Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { Pending, SavedPulse, useSyncedTransition } from "@/components/sync";
import { CommentThread } from "./comment-thread";
import { SubtaskList } from "./subtask-list";
import { LabelEditor } from "./label-editor";
import { AssigneeEditor } from "./assignee-editor";
import { AttachmentGrid } from "./attachment-grid";
import { ActivityFeed } from "./activity-feed";
import { StatusSwitcher } from "./status-switcher";
import { PrioritySwitcher } from "./priority-switcher";
import { DealEditor } from "./deal-editor";
import { ContactPicker, type ContactSummary } from "./contact-picker";
import { BugReportEditor } from "./bug-report-editor";
import { DuplicateSuggestions } from "./duplicate-suggestions";
import { TicketEditor } from "./ticket-editor";
import { TicketContactPicker } from "./ticket-contact-picker";
import { InitiativeEditor } from "./initiative-editor";
import { TaskLinkPicker, type TaskLinkEdge } from "./task-link-picker";
import { archiveTask, updateTask } from "@/server/actions/tasks";
import type { FullBoard, FullTask } from "@/server/queries/boards";
import type {
  WorkspaceContactSummary,
  WorkspaceLinkTargetSummary,
  WorkspaceMember,
} from "./board-client";

type Board = NonNullable<FullBoard>;

export function TaskDetailPanel({
  task,
  boardId,
  boardKind,
  taskKeyPrefix,
  boardLabels,
  boardColumns,
  workspaceId,
  workspaceMembers,
  workspaceContacts,
  workspaceLinkTargets,
  currentUserId,
  onClose,
  onPatchTask,
  onArchived,
}: {
  task: FullTask | null;
  boardId: string;
  boardKind: BoardKind;
  taskKeyPrefix: string;
  boardLabels: Board["labels"];
  boardColumns: { id: string; name: string }[];
  workspaceId: string;
  workspaceMembers: WorkspaceMember[];
  workspaceContacts: WorkspaceContactSummary[];
  workspaceLinkTargets: WorkspaceLinkTargetSummary[];
  currentUserId: string | null;
  onClose: () => void;
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
  onArchived?: (taskId: string) => void;
}) {
  return (
    <Sheet open={!!task} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:!max-w-2xl md:!max-w-3xl"
      >
        {task && (
          <TaskDetailBody
            key={task.id}
            task={task}
            onArchived={onArchived}
            boardId={boardId}
            boardKind={boardKind}
            taskKeyPrefix={taskKeyPrefix}
            boardLabels={boardLabels}
            boardColumns={boardColumns}
            workspaceId={workspaceId}
            workspaceMembers={workspaceMembers}
            workspaceContacts={workspaceContacts}
            workspaceLinkTargets={workspaceLinkTargets}
            currentUserId={currentUserId}
            onPatchTask={onPatchTask}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({
  task,
  boardId,
  boardKind,
  taskKeyPrefix,
  boardLabels,
  boardColumns,
  workspaceId,
  workspaceMembers,
  workspaceContacts,
  workspaceLinkTargets,
  currentUserId,
  onPatchTask,
  onArchived,
}: {
  task: FullTask;
  boardId: string;
  boardKind: BoardKind;
  taskKeyPrefix: string;
  boardLabels: Board["labels"];
  boardColumns: { id: string; name: string }[];
  workspaceId: string;
  workspaceMembers: WorkspaceMember[];
  workspaceContacts: WorkspaceContactSummary[];
  workspaceLinkTargets: WorkspaceLinkTargetSummary[];
  currentUserId: string | null;
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
  onArchived?: (taskId: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueAt, setDueAt] = useState<Date | null>(task.dueAt);
  const [pulse, setPulse] = useState({
    title: 0,
    description: 0,
    priority: 0,
    dueAt: 0,
  });
  type FieldKey = keyof typeof pulse;
  const titleTx = useSyncedTransition();
  const descriptionTx = useSyncedTransition();
  const priorityTx = useSyncedTransition();
  const dueAtTx = useSyncedTransition();
  const archiveTx = useSyncedTransition();

  function handleArchive() {
    archiveTx
      .run("archive-task", () => {
        const fd = new FormData();
        fd.set("taskId", task.id);
        return archiveTask(fd);
      })
      .then((ok) => {
        if (ok !== null) onArchived?.(task.id);
      });
  }

  function bumpPulse(key: FieldKey) {
    setPulse((p) => ({ ...p, [key]: p[key] + 1 }));
  }

  function commitField<K extends FieldKey>(
    key: K,
    patch: Partial<FullTask>,
    tx: ReturnType<typeof useSyncedTransition>,
  ) {
    onPatchTask({ id: task.id, ...patch });
    tx.run("update-task", () =>
      updateTask({
        taskId: task.id,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description as string }
          : {}),
        ...(patch.priority !== undefined
          ? { priority: patch.priority as Priority }
          : {}),
        ...(patch.dueAt !== undefined
          ? { dueAt: patch.dueAt ? patch.dueAt.toISOString() : null }
          : {}),
      }),
    ).then((ok) => {
      if (ok !== null) bumpPulse(key);
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — task key + title */}
      <SheetHeader className="border-border/60 shrink-0 border-b px-6 py-4">
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {taskKeyPrefix}-{task.number}
          </span>
          <Pending isPending={archiveTx.isPending} spinner="inline">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground mr-6 gap-1.5"
              onClick={handleArchive}
            >
              <Archive className="size-3.5" />
              Archive
            </Button>
          </Pending>
        </div>
        <SavedPulse pulseKey={pulse.title} className="block w-full">
          <Pending
            isPending={titleTx.isPending}
            spinner="inline"
            className="block w-full"
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title !== task.title)
                  commitField("title", { title }, titleTx);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Task title"
              className="!h-auto w-full border-none bg-transparent px-0 text-lg font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-xl"
            />
          </Pending>
        </SavedPulse>
      </SheetHeader>

      {/* Properties row — Linear-style horizontal chip bar */}
      <div className="border-border/60 bg-muted/20 shrink-0 border-b px-6 py-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
          <PropertyRow label="Status">
            <StatusSwitcher
              taskId={task.id}
              currentColumnId={task.columnId}
              columns={boardColumns}
            />
          </PropertyRow>
          <PropertyRow label="Priority">
            <SavedPulse pulseKey={pulse.priority}>
              <PrioritySwitcher
                value={priority}
                pending={priorityTx.isPending}
                onChange={(p) => {
                  setPriority(p);
                  commitField("priority", { priority: p }, priorityTx);
                }}
              />
            </SavedPulse>
          </PropertyRow>
          <PropertyRow label="Assignees">
            <AssigneeEditor
              taskId={task.id}
              members={workspaceMembers}
              assignedIds={task.assignees.map((a) => a.user.id)}
              onChange={(assignees) =>
                onPatchTask({
                  id: task.id,
                  assignees: assignees.map((user) => ({ user })),
                } as Partial<FullTask> & { id: string })
              }
            />
          </PropertyRow>
          <PropertyRow label="Due date">
            <SavedPulse pulseKey={pulse.dueAt}>
              <Pending isPending={dueAtTx.isPending} spinner="inline">
                <DueDateControl
                  value={dueAt}
                  onChange={(d) => {
                    setDueAt(d);
                    commitField("dueAt", { dueAt: d }, dueAtTx);
                  }}
                />
              </Pending>
            </SavedPulse>
          </PropertyRow>
          <PropertyRow label="Labels" wide>
            <LabelEditor
              taskId={task.id}
              boardId={boardId}
              allLabels={boardLabels}
              selectedIds={task.labels.map((l) => l.label.id)}
              onChange={(labels) =>
                onPatchTask({
                  id: task.id,
                  labels: labels.map((label) => ({ label })),
                } as Partial<FullTask> & { id: string })
              }
            />
          </PropertyRow>
        </dl>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {boardKind === BoardKind.CRM && (
          <Section title="Deal">
            <DealSection
              task={task}
              workspaceId={workspaceId}
              workspaceContacts={workspaceContacts}
              onPatchTask={onPatchTask}
            />
          </Section>
        )}

        {boardKind === BoardKind.BUGS && (
          <Section title="Bug report">
            <BugReportSection task={task} onPatchTask={onPatchTask} />
            <DuplicateSuggestions taskId={task.id} />
          </Section>
        )}

        {boardKind === BoardKind.SUPPORT && (
          <Section title="Ticket">
            <TicketSection
              task={task}
              workspaceId={workspaceId}
              workspaceContacts={workspaceContacts}
              onPatchTask={onPatchTask}
            />
          </Section>
        )}

        {boardKind === BoardKind.ROADMAP && (
          <Section title="Initiative">
            <InitiativeSection task={task} onPatchTask={onPatchTask} />
          </Section>
        )}

        <Section
          title="Links"
          count={task.outgoingLinks.length + task.incomingLinks.length}
        >
          <LinksSection
            task={task}
            taskKeyPrefix={taskKeyPrefix}
            workspaceLinkTargets={workspaceLinkTargets}
            onPatchTask={onPatchTask}
          />
        </Section>

        <Section title="Description">
          <SavedPulse pulseKey={pulse.description} className="block w-full">
            <Pending
              isPending={descriptionTx.isPending}
              spinner="inline"
              className="block w-full"
            >
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description ?? ""))
                    commitField("description", { description }, descriptionTx);
                }}
                rows={5}
                placeholder="Add a description. Markdown is supported."
                className="w-full resize-y"
              />
            </Pending>
          </SavedPulse>
        </Section>

        <Section title="Subtasks" count={task.subtasks.length}>
          <SubtaskList taskId={task.id} subtasks={task.subtasks} />
        </Section>

        <Section title="Attachments" count={task._count.attachments}>
          <AttachmentGrid taskId={task.id} currentUserId={currentUserId} />
        </Section>

        <Separator />

        <Section title="Comments" count={task._count.comments}>
          <CommentThread
            taskId={task.id}
            currentUserId={currentUserId}
            members={workspaceMembers}
          />
        </Section>

        <Separator />

        <ActivityFeed taskId={task.id} />
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt
        className={
          "text-muted-foreground self-center text-[11px] font-medium tracking-wider uppercase " +
          (wide ? "col-start-1" : "")
        }
      >
        {label}
      </dt>
      <dd className={wide ? "col-span-3 self-center" : "self-center"}>
        {children}
      </dd>
    </>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {title}
        </h3>
        {typeof count === "number" && count > 0 && (
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function DueDateControl({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="size-3" />
              <span className="text-xs">
                {value ? format(value, "MMM d, yyyy") : "Set date"}
              </span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(date) => onChange(date ?? null)}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear due date"
          onClick={() => onChange(null)}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}

function InitiativeSection({
  task,
  onPatchTask,
}: {
  task: FullTask;
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
}) {
  const initiative = task.initiative ?? {
    targetQuarter: null,
    confidence: null,
    effortEstimate: null,
  };

  function patchInitiative(patch: {
    targetQuarter?: string | null;
    confidence?: typeof initiative.confidence;
    effortEstimate?: string | null;
  }) {
    const merged = {
      ...(task.initiative ?? {
        id: "",
        taskId: task.id,
        targetQuarter: null,
        confidence: null,
        effortEstimate: null,
        rice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      ...patch,
    };
    onPatchTask({
      id: task.id,
      initiative: merged,
    } as Partial<FullTask> & { id: string });
  }

  return (
    <InitiativeEditor
      taskId={task.id}
      value={{
        targetQuarter: initiative.targetQuarter,
        confidence: initiative.confidence,
        effortEstimate: initiative.effortEstimate,
      }}
      onPatch={patchInitiative}
    />
  );
}

function LinksSection({
  task,
  taskKeyPrefix,
  workspaceLinkTargets,
  onPatchTask,
}: {
  task: FullTask;
  taskKeyPrefix: string;
  workspaceLinkTargets: WorkspaceLinkTargetSummary[];
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
}) {
  const outgoingEdges: TaskLinkEdge[] = task.outgoingLinks.map((l) => ({
    kind: l.kind,
    taskId: l.to.id,
    number: l.to.number,
    title: l.to.title,
    board: l.to.column.board,
  }));
  const incomingEdges: TaskLinkEdge[] = task.incomingLinks.map((l) => ({
    kind: l.kind,
    taskId: l.from.id,
    number: l.from.number,
    title: l.from.title,
    board: l.from.column.board,
  }));

  function handleAdded(edge: TaskLinkEdge) {
    // We added an OUTGOING edge from the current task.
    onPatchTask({
      id: task.id,
      outgoingLinks: [
        ...task.outgoingLinks,
        {
          kind: edge.kind,
          fromTaskId: task.id,
          toTaskId: edge.taskId,
          createdById: "",
          createdAt: new Date(),
          to: {
            id: edge.taskId,
            number: edge.number,
            title: edge.title,
            column: { board: edge.board },
          },
        },
      ],
    } as Partial<FullTask> & { id: string });
  }

  function handleRemoved(
    kind: TaskLinkEdge["kind"],
    taskId: string,
    direction: "outgoing" | "incoming",
  ) {
    onPatchTask({
      id: task.id,
      outgoingLinks:
        direction === "outgoing"
          ? task.outgoingLinks.filter(
              (l) => !(l.kind === kind && l.to.id === taskId),
            )
          : task.outgoingLinks,
      incomingLinks:
        direction === "incoming"
          ? task.incomingLinks.filter(
              (l) => !(l.kind === kind && l.from.id === taskId),
            )
          : task.incomingLinks,
    } as Partial<FullTask> & { id: string });
  }

  return (
    <TaskLinkPicker
      currentTaskId={task.id}
      taskKeyPrefix={taskKeyPrefix}
      outgoing={outgoingEdges}
      incoming={incomingEdges}
      options={workspaceLinkTargets}
      onAdded={handleAdded}
      onRemoved={handleRemoved}
    />
  );
}

function TicketSection({
  task,
  workspaceId,
  workspaceContacts,
  onPatchTask,
}: {
  task: FullTask;
  workspaceId: string;
  workspaceContacts: WorkspaceContactSummary[];
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
}) {
  const ticket = task.ticket ?? {
    severity: null,
    slaDueAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    source: null,
    contact: null,
  };

  function patchTicket(next: {
    severity?: typeof ticket.severity;
    slaDueAt?: Date | null;
    firstResponseAt?: Date | null;
    resolvedAt?: Date | null;
    source?: string | null;
  }) {
    const merged = {
      ...(task.ticket ?? {
        id: "",
        taskId: task.id,
        contactId: null,
        severity: null,
        slaDueAt: null,
        firstResponseAt: null,
        resolvedAt: null,
        source: null,
        contact: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      ...next,
    };
    onPatchTask({
      id: task.id,
      ticket: merged,
    } as Partial<FullTask> & { id: string });
  }

  function patchContact(contact: ContactSummary | null) {
    const merged = {
      ...(task.ticket ?? {
        id: "",
        taskId: task.id,
        contactId: null,
        severity: null,
        slaDueAt: null,
        firstResponseAt: null,
        resolvedAt: null,
        source: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      contactId: contact?.id ?? null,
      contact,
    };
    onPatchTask({
      id: task.id,
      ticket: merged,
    } as Partial<FullTask> & { id: string });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
      <TicketEditor
        taskId={task.id}
        value={{
          severity: ticket.severity,
          slaDueAt: ticket.slaDueAt,
          firstResponseAt: ticket.firstResponseAt,
          resolvedAt: ticket.resolvedAt,
          source: ticket.source,
        }}
        onPatch={patchTicket}
      />
      <div className="flex flex-col gap-1 md:max-w-xs">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Contact
        </span>
        <TicketContactPicker
          taskId={task.id}
          workspaceId={workspaceId}
          selected={ticket.contact ?? null}
          initialContacts={workspaceContacts}
          onChange={patchContact}
        />
      </div>
    </div>
  );
}

function BugReportSection({
  task,
  onPatchTask,
}: {
  task: FullTask;
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
}) {
  const br = task.bugReport ?? {
    severity: null,
    reproSteps: null,
    expectedBehavior: null,
    actualBehavior: null,
    affectedVersion: null,
    environment: null,
    resolvedAt: null,
  };

  function patchBug(patch: Partial<typeof br>) {
    const merged = {
      ...(task.bugReport ?? {
        id: "",
        taskId: task.id,
        severity: null,
        reproSteps: null,
        expectedBehavior: null,
        actualBehavior: null,
        affectedVersion: null,
        environment: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      ...patch,
    };
    onPatchTask({
      id: task.id,
      bugReport: merged,
    } as Partial<FullTask> & { id: string });
  }

  return <BugReportEditor taskId={task.id} value={br} onPatch={patchBug} />;
}

function DealSection({
  task,
  workspaceId,
  workspaceContacts,
  onPatchTask,
}: {
  task: FullTask;
  workspaceId: string;
  workspaceContacts: WorkspaceContactSummary[];
  onPatchTask: (patch: Partial<FullTask> & { id: string }) => void;
}) {
  const deal = task.deal ?? {
    amount: null,
    currency: null,
    expectedCloseAt: null,
    contacts: [] as { contact: ContactSummary }[],
  };
  const selectedContacts: ContactSummary[] = deal.contacts.map(
    (dc) => dc.contact,
  );

  function patchDeal(next: {
    amount?: number | null;
    currency?: string | null;
    expectedCloseAt?: Date | null;
  }) {
    const merged = {
      ...(task.deal ?? {
        id: "",
        taskId: task.id,
        amount: null,
        currency: null,
        expectedCloseAt: null,
        contacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      ...next,
    };
    onPatchTask({
      id: task.id,
      deal: merged,
    } as Partial<FullTask> & { id: string });
  }

  function patchContacts(contacts: ContactSummary[]) {
    const merged = {
      ...(task.deal ?? {
        id: "",
        taskId: task.id,
        amount: null,
        currency: null,
        expectedCloseAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      contacts: contacts.map((c) => ({ contact: c })),
    };
    onPatchTask({
      id: task.id,
      deal: merged,
    } as Partial<FullTask> & { id: string });
  }

  return (
    <div className="flex flex-col gap-4">
      <DealEditor
        taskId={task.id}
        value={{
          amount: deal.amount,
          currency: deal.currency,
          expectedCloseAt: deal.expectedCloseAt,
        }}
        onPatch={patchDeal}
      />
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Contacts
        </span>
        <ContactPicker
          taskId={task.id}
          workspaceId={workspaceId}
          selected={selectedContacts}
          initialContacts={workspaceContacts}
          onChange={patchContacts}
        />
      </div>
    </div>
  );
}
