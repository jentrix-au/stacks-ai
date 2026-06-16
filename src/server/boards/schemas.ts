import { BoardKind } from "@prisma/client";
import { z } from "zod";

export const CreateBoardSchema = z.object({
  workspaceId: z.string().min(1).describe("Workspace to create the board in."),
  name: z.string().min(1).max(80).describe("Board name (max 80 chars)."),
  kind: z
    .enum(BoardKind)
    .optional()
    .describe(
      "Board kind (default TASKS). Controls the default columns seeded and which sidecar tasks get (CRM=Deal, SUPPORT=Ticket, BUGS=BugReport, ROADMAP=Initiative).",
    ),
});
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;

export const RenameBoardSchema = z.object({
  boardId: z.string().min(1).describe("Board to rename."),
  name: z.string().min(1).max(120).describe("New board name."),
});
export type RenameBoardInput = z.infer<typeof RenameBoardSchema>;

export const ConvertBoardKindSchema = z.object({
  boardId: z
    .string()
    .min(1)
    .describe("Board to convert. Discover via list_boards(workspaceId)."),
  kind: z
    .enum(BoardKind)
    .describe(
      "Target kind (TASKS/CRM/SUPPORT/BUGS/ROADMAP). Converting eagerly creates the target kind's sidecar (Deal/BugReport/Ticket/Initiative) on every non-archived task; existing columns and sidecars of other kinds are preserved.",
    ),
});
export type ConvertBoardKindInput = z.infer<typeof ConvertBoardKindSchema>;
