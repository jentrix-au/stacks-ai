"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import {
  LinkTicketContactSchema,
  UpdateTicketSchema,
} from "@/server/tasks/schemas";

export async function updateTicket(input: z.infer<typeof UpdateTicketSchema>) {
  const user = await requireUser();
  return ops.updateTicket(user.id, UpdateTicketSchema.parse(input), "ui");
}

export async function linkTicketContact(
  input: z.infer<typeof LinkTicketContactSchema>,
) {
  const user = await requireUser();
  return ops.linkTicketContact(
    user.id,
    LinkTicketContactSchema.parse(input),
    "ui",
  );
}
