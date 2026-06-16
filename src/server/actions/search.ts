"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { searchWorkspace } from "@/server/queries/search";

const SearchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  query: z.string().max(200),
});

/** Live search behind the cmd-K palette. Read-only; authz in the query layer. */
export async function searchWorkspaceAction(
  input: z.infer<typeof SearchWorkspaceSchema>,
) {
  const user = await requireUser();
  const { workspaceId, query } = SearchWorkspaceSchema.parse(input);
  return searchWorkspace(user.id, { workspaceId, query, takePerType: 8 });
}
