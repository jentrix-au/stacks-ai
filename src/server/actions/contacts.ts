"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as contactOps from "@/server/contacts/operations";
import {
  ArchiveContactSchema,
  CreateContactSchema,
  MergeContactsSchema,
  UpdateContactSchema,
} from "@/server/contacts/schemas";

export async function createContact(
  input: z.infer<typeof CreateContactSchema>,
) {
  const user = await requireUser();
  return contactOps.createContact(user.id, CreateContactSchema.parse(input));
}

export async function updateContact(
  input: z.infer<typeof UpdateContactSchema>,
) {
  const user = await requireUser();
  return contactOps.updateContact(user.id, UpdateContactSchema.parse(input));
}

export async function archiveContact(
  input: z.infer<typeof ArchiveContactSchema>,
) {
  const user = await requireUser();
  return contactOps.archiveContact(user.id, ArchiveContactSchema.parse(input));
}

export async function mergeContacts(
  input: z.infer<typeof MergeContactsSchema>,
) {
  const user = await requireUser();
  await contactOps.mergeContacts(user.id, MergeContactsSchema.parse(input));
}
