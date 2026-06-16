"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function updateProfileAction(input: unknown) {
  const user = await requireUser();
  const { name } = UpdateProfileSchema.parse(input);
  await db.user.update({ where: { id: user.id }, data: { name } });
  // The name renders in the topbar user menu on every workspace page.
  revalidatePath("/", "layout");
}
