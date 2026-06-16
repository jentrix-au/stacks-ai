"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import {
  SetDealContactsSchema,
  UpdateDealSchema,
} from "@/server/tasks/schemas";

export async function updateDeal(input: z.infer<typeof UpdateDealSchema>) {
  const user = await requireUser();
  return ops.updateDeal(user.id, UpdateDealSchema.parse(input), "ui");
}

export async function setDealContacts(
  input: z.infer<typeof SetDealContactsSchema>,
) {
  const user = await requireUser();
  return ops.setDealContacts(user.id, SetDealContactsSchema.parse(input), "ui");
}
