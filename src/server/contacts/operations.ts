import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  AuthzError,
  requireContactAccess,
  requireWorkspaceRole,
} from "@/lib/authz";
import { assertFresh } from "@/lib/freshness";

import type {
  ArchiveContactInput,
  CreateContactInput,
  ListContactsInput,
  MergeContactsInput,
  UpdateContactInput,
} from "./schemas";

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 50;

async function workspaceSlug(workspaceId: string): Promise<string | null> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  return ws?.slug ?? null;
}

export async function createContact(
  userId: string,
  input: CreateContactInput,
): Promise<{ id: string }> {
  await requireWorkspaceRole(userId, input.workspaceId);
  const contact = await db.contact.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      externalId: input.externalId ?? null,
      createdById: userId,
    },
    select: { id: true },
  });
  const slug = await workspaceSlug(input.workspaceId);
  if (slug) revalidatePath(`/${slug}/contacts`);
  return contact;
}

export async function updateContact(
  userId: string,
  input: UpdateContactInput,
): Promise<void> {
  const contact = await requireContactAccess(userId, input.contactId);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.company !== undefined) data.company = input.company;
  if (input.externalId !== undefined) data.externalId = input.externalId;
  if (Object.keys(data).length === 0) return;

  if (input.expectedUpdatedAt) {
    const current = await db.contact.findUnique({
      where: { id: contact.id },
    });
    if (current) {
      assertFresh(input.expectedUpdatedAt, current.updatedAt, {
        ...current,
        archivedAt: current.archivedAt
          ? current.archivedAt.toISOString()
          : null,
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      });
    }
  }

  await db.contact.update({ where: { id: contact.id }, data });
  const slug = await workspaceSlug(contact.workspaceId);
  if (slug) revalidatePath(`/${slug}/contacts`);
}

export async function archiveContact(
  userId: string,
  input: ArchiveContactInput,
): Promise<void> {
  const contact = await requireContactAccess(userId, input.contactId);
  await db.contact.update({
    where: { id: contact.id },
    data: { archivedAt: new Date() },
  });
  const slug = await workspaceSlug(contact.workspaceId);
  if (slug) revalidatePath(`/${slug}/contacts`);
}

export async function listContacts(
  userId: string,
  input: ListContactsInput,
  responseFormat: "concise" | "detailed" = "detailed",
) {
  await requireWorkspaceRole(userId, input.workspaceId);
  const take = Math.min(
    Math.max(input.take ?? DEFAULT_PER_PAGE, 1),
    MAX_PER_PAGE,
  );
  const q = input.query?.trim();
  const where = {
    workspaceId: input.workspaceId,
    ...(input.includeArchived ? {} : { archivedAt: null }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { company: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [totalCount, contacts] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        externalId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const hasMore = contacts.length > take;
  const trimmed = hasMore ? contacts.slice(0, take) : contacts;
  const rows = trimmed.map((c) =>
    responseFormat === "concise"
      ? { id: c.id, name: c.name, email: c.email, company: c.company }
      : {
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
        },
  );
  return {
    contacts: rows,
    totalCount,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
    ...(hasMore
      ? {
          notice: `Showing ${rows.length} of ${totalCount} contacts — pass nextCursor as the cursor argument to continue.`,
        }
      : {}),
  };
}

/** Single-contact getter used by MCP. UI uses listContacts. */
export async function getContact(userId: string, contactId: string) {
  await requireContactAccess(userId, contactId);
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      externalId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!contact) throw new AuthzError("Contact not found", 404);
  return {
    ...contact,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
    archivedAt: contact.archivedAt ? contact.archivedAt.toISOString() : null,
  };
}

/**
 * Merge duplicate people (P3.9): the duplicate's deal links and tickets move
 * to the survivor, empty survivor fields are filled from the duplicate, and
 * the duplicate row is DELETED — all in one transaction.
 */
export async function mergeContacts(
  userId: string,
  input: MergeContactsInput,
): Promise<void> {
  if (input.survivorId === input.duplicateId) {
    throw new AuthzError("Cannot merge a contact into itself", 400);
  }
  const survivor = await requireContactAccess(userId, input.survivorId);
  const duplicate = await requireContactAccess(userId, input.duplicateId);
  if (survivor.workspaceId !== duplicate.workspaceId) {
    throw new AuthzError("Contacts belong to different workspaces", 400);
  }

  await db.$transaction(async (tx) => {
    const [s, d] = await Promise.all([
      tx.contact.findUniqueOrThrow({ where: { id: survivor.id } }),
      tx.contact.findUniqueOrThrow({ where: { id: duplicate.id } }),
    ]);
    // Move deal links; drop ones the survivor already has (composite PK).
    const dupDeals = await tx.dealContact.findMany({
      where: { contactId: d.id },
      select: { dealId: true },
    });
    await tx.dealContact.deleteMany({ where: { contactId: d.id } });
    if (dupDeals.length > 0) {
      await tx.dealContact.createMany({
        data: dupDeals.map((x) => ({ dealId: x.dealId, contactId: s.id })),
        skipDuplicates: true,
      });
    }
    await tx.ticket.updateMany({
      where: { contactId: d.id },
      data: { contactId: s.id },
    });
    await tx.contact.update({
      where: { id: s.id },
      data: {
        email: s.email ?? d.email,
        phone: s.phone ?? d.phone,
        company: s.company ?? d.company,
        externalId: s.externalId ?? d.externalId,
      },
    });
    await tx.contact.delete({ where: { id: d.id } });
  });

  const slug = await workspaceSlug(survivor.workspaceId);
  if (slug) revalidatePath(`/${slug}/contacts`);
}
