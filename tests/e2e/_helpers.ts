import type { Page } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Signs the current page in as the seeded demo user via the dev-only
 * /api/dev/sign-in endpoint. The resulting session cookie lives on the
 * page's browser context.
 */
export async function signInAsDemo(page: Page) {
  await signInAs(page, "demo@stacks.local");
}

/** Dev sign-in as any seeded user (e.g. casey@stacks.local). */
export async function signInAs(page: Page, email: string) {
  const res = await page.request.post(`${BASE_URL}/api/dev/sign-in`, {
    data: { email },
  });
  if (!res.ok()) {
    throw new Error(
      `Dev sign-in failed (${res.status()}): ${await res.text()}`,
    );
  }
}
