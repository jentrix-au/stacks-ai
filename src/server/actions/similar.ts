"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import { findDuplicateSuggestions } from "@/server/queries/similar";

/**
 * Duplicate candidates for the detail panel (P4.3) — read-only, returns []
 * when the embeddings provider is not configured so the section hides.
 */
export async function fetchDuplicateSuggestions(taskId: string) {
  const user = await requireUser();
  return findDuplicateSuggestions(user.id, z.string().min(1).parse(taskId));
}
