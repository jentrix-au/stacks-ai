"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as importOps from "@/server/imports/operations";
import {
  ImportContactsSchema,
  ImportTasksSchema,
  TrelloImportSchema,
} from "@/server/imports/schemas";

export async function importContactsPreview(
  input: z.infer<typeof ImportContactsSchema>,
) {
  const user = await requireUser();
  return importOps.importContactsPreview(
    user.id,
    ImportContactsSchema.parse(input),
  );
}

export async function importContactsApply(
  input: z.infer<typeof ImportContactsSchema>,
) {
  const user = await requireUser();
  return importOps.importContactsApply(
    user.id,
    ImportContactsSchema.parse(input),
  );
}

export async function importTasksPreview(
  input: z.infer<typeof ImportTasksSchema>,
) {
  const user = await requireUser();
  return importOps.importTasksPreview(user.id, ImportTasksSchema.parse(input));
}

export async function importTasksApply(
  input: z.infer<typeof ImportTasksSchema>,
) {
  const user = await requireUser();
  return importOps.importTasksApply(user.id, ImportTasksSchema.parse(input));
}

export async function importTrelloBoard(
  input: z.infer<typeof TrelloImportSchema>,
) {
  const user = await requireUser();
  return importOps.importTrelloBoard(user.id, TrelloImportSchema.parse(input));
}
