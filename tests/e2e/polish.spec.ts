import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.9 polish batch: per-kind quick-create fields and the contact merge UI.
// (Fine-grained realtime patching is unit-tested in realtime-patch.test.ts.)

test.describe("Polish batch", () => {
  test("CRM quick-create sets the deal amount and contact inline", async ({
    page,
  }) => {
    const title = `Quick deal ${Date.now()}`;
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");

    await page.getByRole("button", { name: /add task/i }).first().click();
    await page.getByPlaceholder("Task title").fill(title);
    await page.getByLabel("Deal amount").fill("1200");
    await page
      .getByRole("combobox", { name: /^contact$/i })
      .selectOption({ label: "Dana Reyes" });
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();

    // After a reload the card renders the deal amount from the sidecar.
    await page.reload();
    const card = page.getByRole("button", { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/1,200/);
  });

  test("merge folds a duplicate person into the survivor", async ({
    page,
  }) => {
    const dupName = `Dana Duplicate ${Date.now()}`;
    await signInAsDemo(page);
    await page.goto("/demo/contacts");

    // Create the duplicate with a phone the survivor lacks.
    await page.getByRole("button", { name: /new contact/i }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Name").fill(dupName);
    await form.getByLabel("Phone").fill("+1 555 000 1111");
    await form.getByRole("button", { name: /create contact/i }).click();
    await expect(page.getByText(dupName)).toBeVisible();

    // Merge it into Dana Reyes.
    await page
      .getByRole("button", { name: /merge a duplicate into dana reyes/i })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel(/duplicate to fold in/i)
      .selectOption({ label: dupName });
    await dialog.getByRole("button", { name: /merge contacts/i }).click();

    // Duplicate row is gone; the survivor picked up the phone number.
    await expect(page.getByText(dupName)).toHaveCount(0);
    await expect(page.getByText("Dana Reyes")).toBeVisible();
    await expect(page.getByText("+1 555 000 1111")).toBeVisible();
  });
});
