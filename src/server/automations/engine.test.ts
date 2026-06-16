import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyRules, findFirstTask, updateRule, createActivity, tx } =
  vi.hoisted(() => ({
    findManyRules: vi.fn(),
    findFirstTask: vi.fn(),
    updateRule: vi.fn(),
    createActivity: vi.fn(),
    tx: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    automationRule: { findMany: findManyRules, update: updateRule },
    task: { findFirst: findFirstTask },
    activity: { create: createActivity },
    $transaction: tx,
  },
}));
vi.mock("@/lib/events", () => ({
  emitBoardEvent: vi.fn(),
  scheduleAfterResponse: vi.fn(),
}));

const { setTaskLabels } = vi.hoisted(() => ({ setTaskLabels: vi.fn() }));
vi.mock("@/server/tasks/operations", () => ({
  moveTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskLabels,
  setTaskAssignees: vi.fn(),
  createTask: vi.fn(),
}));
vi.mock("@/server/comments/operations", () => ({ createComment: vi.fn() }));

import {
  conditionsMatch,
  dispatchAutomationEvent,
  triggerMatches,
  type AutomationEvent,
} from "./engine";

const EVENT: AutomationEvent = {
  kind: "label.added",
  taskId: "t1",
  boardId: "b1",
  workspaceId: "ws1",
  labelId: "L",
  source: "ui",
};

const SELF_TRIGGER_RULE = {
  id: "r1",
  name: "self-trigger",
  createdById: "owner",
  workspaceId: "ws1",
  boardId: "b1",
  enabled: true,
  trigger: { type: "label.added", labelId: "L" },
  conditions: {},
  actions: [{ type: "add_label", labelId: "L" }],
  runCount: 0,
  lastRunAt: null,
};

describe("triggerMatches", () => {
  it("matches by kind, with optional column/label narrowing", () => {
    expect(triggerMatches({ type: "task.created" }, { ...EVENT, kind: "task.created" })).toBe(true);
    expect(triggerMatches({ type: "task.created" }, EVENT)).toBe(false);
    expect(
      triggerMatches(
        { type: "task.moved_to_column", columnId: "c1" },
        { ...EVENT, kind: "task.moved_to_column", columnId: "c1" },
      ),
    ).toBe(true);
    expect(
      triggerMatches(
        { type: "task.moved_to_column", columnId: "c1" },
        { ...EVENT, kind: "task.moved_to_column", columnId: "c2" },
      ),
    ).toBe(false);
    expect(
      triggerMatches({ type: "task.moved_to_column" }, {
        ...EVENT,
        kind: "task.moved_to_column",
        columnId: "anything",
      }),
    ).toBe(true);
    expect(triggerMatches({ type: "label.added", labelId: "L" }, EVENT)).toBe(true);
    expect(triggerMatches({ type: "label.added", labelId: "other" }, EVENT)).toBe(false);
  });
});

describe("conditionsMatch", () => {
  const facts = {
    priority: "HIGH",
    labelIds: ["L"],
    assigneeIds: [],
    bugSeverity: "CRITICAL",
    ticketSeverity: null,
  };

  it("evaluates priority/label/assignee/sidecar predicates", () => {
    expect(conditionsMatch({}, facts)).toBe(true);
    expect(conditionsMatch({ priorityIn: ["HIGH"] }, facts)).toBe(true);
    expect(conditionsMatch({ priorityIn: ["LOW"] }, facts)).toBe(false);
    expect(conditionsMatch({ hasLabelId: "L" }, facts)).toBe(true);
    expect(conditionsMatch({ hasLabelId: "x" }, facts)).toBe(false);
    expect(conditionsMatch({ unassigned: true }, facts)).toBe(true);
    expect(conditionsMatch({ assigneeId: "u1" }, facts)).toBe(false);
    expect(conditionsMatch({ bugSeverityIn: ["CRITICAL"] }, facts)).toBe(true);
    expect(conditionsMatch({ ticketSeverityIn: ["URGENT"] }, facts)).toBe(false);
  });
});

describe("dispatchAutomationEvent loop guard", () => {
  beforeEach(() => {
    findManyRules.mockReset();
    findFirstTask.mockReset();
    setTaskLabels.mockReset();
    tx.mockReset();
    tx.mockResolvedValue([]);
    findManyRules.mockResolvedValue([SELF_TRIGGER_RULE]);
    // Task lacks label L, so the add_label action proceeds.
    findFirstTask.mockResolvedValue({
      priority: "MEDIUM",
      labels: [],
      assignees: [],
      bugReport: null,
      ticket: null,
    });
  });

  it("a rule that would re-trigger itself runs exactly once", async () => {
    // The user-sourced event triggers the rule…
    await dispatchAutomationEvent(EVENT);
    expect(setTaskLabels).toHaveBeenCalledTimes(1);
    expect(setTaskLabels).toHaveBeenCalledWith(
      "owner",
      { taskId: "t1", labelIds: ["L"] },
      "automation",
    );

    // …whose op would dispatch the SAME event with source "automation" —
    // the guard drops it before any rule lookup.
    await dispatchAutomationEvent({ ...EVENT, source: "automation" });
    expect(setTaskLabels).toHaveBeenCalledTimes(1);
    expect(findManyRules).toHaveBeenCalledTimes(1);
  });

  it("records the run: counter + AUTOMATION_RAN activity", async () => {
    await dispatchAutomationEvent(EVENT);
    expect(tx).toHaveBeenCalledTimes(1);
    expect(updateRule).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { runCount: { increment: 1 }, lastRunAt: expect.any(Date) },
      }),
    );
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskId: "t1",
          actorId: null,
          type: "AUTOMATION_RAN",
          payload: expect.objectContaining({
            source: "automation",
            ruleId: "r1",
          }),
        }),
      }),
    );
  });

  it("skips rules whose conditions don't match", async () => {
    findManyRules.mockResolvedValue([
      { ...SELF_TRIGGER_RULE, conditions: { priorityIn: ["URGENT"] } },
    ]);
    await dispatchAutomationEvent(EVENT);
    expect(setTaskLabels).not.toHaveBeenCalled();
  });

  it("skips rules with malformed JSON instead of crashing", async () => {
    findManyRules.mockResolvedValue([
      { ...SELF_TRIGGER_RULE, trigger: { type: "nonsense" } },
    ]);
    await expect(dispatchAutomationEvent(EVENT)).resolves.toBeUndefined();
    expect(setTaskLabels).not.toHaveBeenCalled();
  });
});
