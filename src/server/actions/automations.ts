"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as automationOps from "@/server/automations/operations";
import {
  CreateAutomationSchema,
  DeleteAutomationSchema,
  ListAutomationsSchema,
  SetAutomationEnabledSchema,
} from "@/server/automations/schemas";

export async function listAutomations(
  input: z.infer<typeof ListAutomationsSchema>,
) {
  const user = await requireUser();
  return automationOps.listAutomations(
    user.id,
    ListAutomationsSchema.parse(input),
  );
}

export async function createAutomation(
  input: z.infer<typeof CreateAutomationSchema>,
) {
  const user = await requireUser();
  return automationOps.createAutomation(
    user.id,
    CreateAutomationSchema.parse(input),
  );
}

export async function setAutomationEnabled(
  input: z.infer<typeof SetAutomationEnabledSchema>,
) {
  const user = await requireUser();
  return automationOps.setAutomationEnabled(
    user.id,
    SetAutomationEnabledSchema.parse(input),
  );
}

export async function deleteAutomation(
  input: z.infer<typeof DeleteAutomationSchema>,
) {
  const user = await requireUser();
  await automationOps.deleteAutomation(
    user.id,
    DeleteAutomationSchema.parse(input),
  );
}
