import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { connectMcp } from "./_harness";

// The full MCP tool surface, frozen by P2.2: names, annotations, and
// output schemas. Changing any of these is an agent-visible contract change
// — update deliberately.

const READS = [
  "list_workspaces",
  "list_boards",
  "list_columns",
  "list_labels",
  "list_members",
  "list_tasks",
  "get_task",
  "list_contacts",
  "list_initiatives",
  "list_task_links",
  "get_board_snapshot",
  "search_tasks",
  "find_similar_tasks",
  "list_activity",
  "list_comments",
  "list_attachments",
];

const WRITES = [
  "create_task",
  "update_task",
  "move_task",
  "archive_task",
  "set_task_labels",
  "set_task_assignees",
  "update_deal",
  "set_deal_contacts",
  "create_contact",
  "update_contact",
  "archive_contact",
  "update_bug_report",
  "update_ticket",
  "link_contact",
  "update_initiative",
  "add_task_link",
  "remove_task_link",
  "create_comment",
  "update_comment",
  "delete_comment",
  "create_subtask",
  "toggle_subtask",
  "delete_subtask",
  "manage_labels",
  "manage_columns",
  "create_board",
  "rename_board",
  "bulk_create_tasks",
  "bulk_update_tasks",
  "bulk_move_tasks",
];

// Admin token-scope tools. The list_* entries are read-annotated but still
// require the admin scope (webhooks exfiltrate data outward; automation
// rules act with their creator's identity).
const ADMIN = [
  "convert_board_kind",
  "create_webhook",
  "list_webhooks",
  "delete_webhook",
  "list_webhook_deliveries",
  "list_automations",
  "create_automation",
  "set_automation_enabled",
];

const ADMIN_READS = [
  "list_webhooks",
  "list_webhook_deliveries",
  "list_automations",
];

const DESTRUCTIVE = [
  "archive_task",
  "archive_contact",
  "convert_board_kind",
  "delete_comment",
  "delete_subtask",
  "manage_labels",
  "manage_columns",
  "delete_webhook",
];

const IDEMPOTENT = [
  "update_task",
  "set_task_labels",
  "set_task_assignees",
  "update_deal",
  "set_deal_contacts",
  "update_contact",
  "update_bug_report",
  "update_ticket",
  "link_contact",
  "update_initiative",
  "add_task_link",
  "remove_task_link",
  "convert_board_kind",
  "update_comment",
  "toggle_subtask",
  "rename_board",
  "bulk_update_tasks",
  "set_automation_enabled",
];

const RESPONSE_FORMAT_TOOLS = ["list_tasks", "get_task", "list_contacts"];

describe("MCP tool surface", () => {
  it("registers exactly the expected tools", async () => {
    const { client } = await connectMcp();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [...READS, ...WRITES, ...ADMIN].sort(),
    );
  });

  it("every tool has a description, an output schema, and closed-world annotations", async () => {
    const { client } = await connectMcp();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.outputSchema, `${tool.name} outputSchema`).toBeDefined();
      expect(
        tool.annotations?.openWorldHint,
        `${tool.name} openWorldHint`,
      ).toBe(false);
    }
  });

  it("annotates reads, destructive tools, and idempotent tools correctly", async () => {
    const { client } = await connectMcp();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const a = tool.annotations!;
      const isRead =
        READS.includes(tool.name) || ADMIN_READS.includes(tool.name);
      expect(!!a.readOnlyHint, `${tool.name} readOnlyHint`).toBe(isRead);
      if (!isRead) {
        expect(!!a.destructiveHint, `${tool.name} destructiveHint`).toBe(
          DESTRUCTIVE.includes(tool.name),
        );
        expect(!!a.idempotentHint, `${tool.name} idempotentHint`).toBe(
          IDEMPOTENT.includes(tool.name),
        );
      }
    }
  });

  it("exposes response_format on the token-heavy read tools", async () => {
    const { client } = await connectMcp();
    const { tools } = await client.listTools();
    for (const name of RESPONSE_FORMAT_TOOLS) {
      const tool = tools.find((t) => t.name === name)!;
      const properties = tool.inputSchema.properties as Record<string, unknown>;
      expect(
        properties.response_format,
        `${name} response_format`,
      ).toBeDefined();
    }
  });
});
