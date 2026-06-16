/** Normalize a free-form string into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Derive the workspace task-key prefix ("STK" in STK-123) from a slug:
 * strip non-alphanumerics, uppercase, take the first 3 chars. Falls back to
 * "WS" for degenerate slugs. Must stay in sync with the SQL mirror in the
 * 20260612000100_task_workspace_id_and_numbers migration backfill.
 */
export function taskPrefixFromSlug(slug: string): string {
  return (
    slug
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "WS"
  );
}

/**
 * Given a desired slug and a checker that returns true if a candidate is
 * already taken, append a numeric suffix until a free slug is found.
 */
export async function uniqueSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(desired) || "untitled";
  if (!(await isTaken(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // extreme fallback
  return `${base}-${Date.now().toString(36)}`;
}
