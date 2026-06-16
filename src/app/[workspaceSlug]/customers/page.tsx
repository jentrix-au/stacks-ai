import { redirect } from "next/navigation";

/**
 * Customer was merged into Contact (P1.3) — the customers page permanently
 * forwards to the unified People directory.
 */
export default async function CustomersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/contacts`);
}
