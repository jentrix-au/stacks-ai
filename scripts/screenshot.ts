import { chromium } from "@playwright/test";

async function main() {
  const port = process.env.PORT ?? "3000";
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  await page.request.post(`http://localhost:${port}/api/dev/sign-in`, {
    data: {},
  });

  await page.goto(`http://localhost:${port}/demo/board/roadmap`);
  await page.waitForLoadState("networkidle");

  // Open the board overflow menu → Manage labels
  await page.getByRole("button", { name: /board options/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: /manage labels/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "tmp-labels.png", fullPage: false });
  console.log("Saved tmp-labels.png");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
