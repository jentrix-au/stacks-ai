"use client";

import { useEffect, useState } from "react";
import { Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  setAutomationEnabled,
} from "@/server/actions/automations";
import type { AutomationRuleSummary } from "@/server/automations/operations";
import type { CreateAutomationInput } from "@/server/automations/schemas";
import { Priority } from "@/lib/enums";
import type { WorkspaceMember } from "./board-client";

type TemplateKey = "move_assign" | "move_priority" | "created_label" | "due_comment";

const TEMPLATES: Record<TemplateKey, string> = {
  move_assign: "When a card moves to a column → assign someone",
  move_priority: "When a card moves to a column → set priority",
  created_label: "When a card is created → add a label",
  due_comment: "When the due date passes → comment",
};

const selectCls =
  "border-input bg-transparent h-8 w-full rounded-md border px-2 text-sm";

/** Template-style automation builder + rule list (P3.7). */
export function AutomationsDialog({
  open,
  onOpenChange,
  boardId,
  workspaceId,
  columns,
  labels,
  members,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boardId: string;
  workspaceId: string;
  columns: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  members: WorkspaceMember[];
}) {
  const [rules, setRules] = useState<AutomationRuleSummary[] | null>(null);
  const [template, setTemplate] = useState<TemplateKey>("move_assign");
  const [columnId, setColumnId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [labelId, setLabelId] = useState("");
  const [priority, setPriority] = useState<Priority>(Priority.HIGH);
  const [commentBody, setCommentBody] = useState("");
  const createTx = useSyncedTransition();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listAutomations({ workspaceId, boardId })
      .then((res) => {
        if (alive) setRules(res.automations);
      })
      .catch(() => toast.error("Could not load automations"));
    return () => {
      alive = false;
    };
  }, [open, workspaceId, boardId]);

  function buildInput(): CreateAutomationInput | null {
    const col = columns.find((c) => c.id === columnId);
    const member = members.find((m) => m.id === memberId);
    const label = labels.find((l) => l.id === labelId);
    switch (template) {
      case "move_assign":
        if (!col || !member) return null;
        return {
          workspaceId,
          boardId,
          name: `Moved to ${col.name} → assign ${member.name ?? member.email}`,
          trigger: { type: "task.moved_to_column", columnId: col.id },
          conditions: {},
          actions: [{ type: "assign", userId: member.id }],
          enabled: true,
        };
      case "move_priority":
        if (!col) return null;
        return {
          workspaceId,
          boardId,
          name: `Moved to ${col.name} → priority ${priority}`,
          trigger: { type: "task.moved_to_column", columnId: col.id },
          conditions: {},
          actions: [{ type: "set_priority", priority }],
          enabled: true,
        };
      case "created_label":
        if (!label) return null;
        return {
          workspaceId,
          boardId,
          name: `Created → label ${label.name}`,
          trigger: { type: "task.created" },
          conditions: {},
          actions: [{ type: "add_label", labelId: label.id }],
          enabled: true,
        };
      case "due_comment":
        if (!commentBody.trim()) return null;
        return {
          workspaceId,
          boardId,
          name: "Due date passed → comment",
          trigger: { type: "due.passed" },
          conditions: {},
          actions: [{ type: "comment", body: commentBody.trim() }],
          enabled: true,
        };
    }
  }

  async function create() {
    const input = buildInput();
    if (!input) return;
    const created = await createTx.run("create-automation", () =>
      createAutomation(input),
    );
    if (created === null) return;
    setRules((r) => [...(r ?? []), created]);
    setCommentBody("");
  }

  function toggle(rule: AutomationRuleSummary, enabled: boolean) {
    setRules(
      (r) => r?.map((x) => (x.id === rule.id ? { ...x, enabled } : x)) ?? null,
    );
    setAutomationEnabled({ ruleId: rule.id, enabled }).catch(() => {
      setRules(
        (r) =>
          r?.map((x) => (x.id === rule.id ? { ...x, enabled: !enabled } : x)) ??
          null,
      );
      toast.error("Could not update the rule");
    });
  }

  function remove(rule: AutomationRuleSummary) {
    setRules((r) => r?.filter((x) => x.id !== rule.id) ?? null);
    deleteAutomation({ ruleId: rule.id }).catch(() => {
      setRules((r) => [...(r ?? []), rule]);
      toast.error("Could not delete the rule");
    });
  }

  const canCreate = buildInput() !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Zap className="size-4" />
            Automations
          </DialogTitle>
          <DialogDescription>
            Rules run automatically when things happen on this board. Their
            actions can never trigger other rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rules === null ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rules yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <Checkbox
                    aria-label={`Enable ${rule.name}`}
                    checked={rule.enabled}
                    onCheckedChange={(v) => toggle(rule, v === true)}
                  />
                  <span className="min-w-0 flex-1 truncate">{rule.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {rule.runCount} run{rule.runCount === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete rule ${rule.name}`}
                    onClick={() => remove(rule)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border space-y-3 rounded-md border p-3">
          <Label className="text-xs font-medium">New rule</Label>
          <select
            aria-label="Rule template"
            className={selectCls}
            value={template}
            onChange={(e) => setTemplate(e.target.value as TemplateKey)}
          >
            {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
              <option key={key} value={key}>
                {TEMPLATES[key]}
              </option>
            ))}
          </select>

          {(template === "move_assign" || template === "move_priority") && (
            <select
              aria-label="Column"
              className={selectCls}
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
            >
              <option value="">Choose a column…</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {template === "move_assign" && (
            <select
              aria-label="Member"
              className={selectCls}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Choose a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          )}

          {template === "move_priority" && (
            <select
              aria-label="Priority"
              className={selectCls}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {Object.values(Priority).map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          )}

          {template === "created_label" && (
            <select
              aria-label="Label"
              className={selectCls}
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Choose a label…</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}

          {template === "due_comment" && (
            <input
              aria-label="Comment text"
              className={selectCls}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Comment to post…"
            />
          )}

          <Button
            size="sm"
            onClick={create}
            disabled={!canCreate}
            loading={createTx.isPending}
            loadingText="Creating…"
          >
            Create rule
          </Button>
          <p className="text-muted-foreground text-xs">
            Requires the admin role. Rules act on your behalf.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
