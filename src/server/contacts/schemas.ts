import { z } from "zod";

const ContactName = z
  .string()
  .min(1)
  .max(120)
  .describe("Display name for the contact (max 120 chars).");

const ContactEmail = z
  .string()
  .email()
  .max(255)
  .nullable()
  .optional()
  .describe("Primary email address (optional). Pass null to clear.");

const ContactPhone = z
  .string()
  .max(40)
  .nullable()
  .optional()
  .describe("Phone number, free-form (optional). Pass null to clear.");

const ContactCompany = z
  .string()
  .max(120)
  .nullable()
  .optional()
  .describe("Company / account name (optional). Pass null to clear.");

const ContactExternalId = z
  .string()
  .max(120)
  .nullable()
  .optional()
  .describe(
    "External identifier (e.g. from an external CRM / auth system). Pass null to clear.",
  );

export const CreateContactSchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .describe(
      "Workspace this contact belongs to. Discover via list_workspaces.",
    ),
  name: ContactName,
  email: ContactEmail,
  phone: ContactPhone,
  company: ContactCompany,
  externalId: ContactExternalId,
});
export type CreateContactInput = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = z.object({
  contactId: z.string().min(1).describe("ID of the contact to update."),
  name: ContactName.optional(),
  email: ContactEmail,
  phone: ContactPhone,
  company: ContactCompany,
  externalId: ContactExternalId,
  expectedUpdatedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "Optimistic concurrency guard: the contact's updatedAt from your last read. If it changed since, the call fails with CONFLICT and the error embeds the current contact.",
    ),
});
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const ArchiveContactSchema = z.object({
  contactId: z.string().min(1).describe("ID of the contact to archive."),
});
export type ArchiveContactInput = z.infer<typeof ArchiveContactSchema>;

export const ListContactsSchema = z.object({
  workspaceId: z.string().min(1).describe("Workspace ID."),
  query: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      "Substring filter applied case-insensitively to name, email, and company.",
    ),
  includeArchived: z
    .boolean()
    .optional()
    .describe("Include archived contacts (default false)."),
  take: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (default 50, max 100)."),
  cursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Pagination cursor from a previous response's nextCursor."),
});
export type ListContactsInput = z.infer<typeof ListContactsSchema>;

export const MergeContactsSchema = z.object({
  survivorId: z.string().min(1).describe("Contact that remains."),
  duplicateId: z
    .string()
    .min(1)
    .describe("Contact folded into the survivor and deleted."),
});
export type MergeContactsInput = z.infer<typeof MergeContactsSchema>;
