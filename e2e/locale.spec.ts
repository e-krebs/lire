import { expect, test, type Page } from "./fixtures";

const ui = (page: Page) => ({
  get html() {
    return page.locator("html");
  },
  get englishAccountMenuTrigger() {
    return page.getByRole("button", { name: "Account and app info" });
  },
  get frenchAccountMenuTrigger() {
    return page.getByRole("button", { name: "Compte et infos de l'appli" });
  },
  get languageSelect() {
    return page.getByLabel("Language");
  },
  get frenchManageSubscriptionsLink() {
    return page.getByRole("link", { name: "Gérer les abonnements" });
  },
});

test.describe("a French browser", () => {
  test.use({ locale: "fr-FR" });

  test("loads the app in French", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.html).toHaveAttribute("lang", "fr");
    await pageUi.frenchAccountMenuTrigger.click();
    await expect(pageUi.frenchManageSubscriptionsLink).toBeVisible();
  });
});

test.describe("an English browser", () => {
  test.use({ locale: "en-US" });

  test("switches to French from the account menu and keeps it after a reload", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.html).toHaveAttribute("lang", "en");
    await pageUi.englishAccountMenuTrigger.click();
    await pageUi.languageSelect.selectOption({ label: "Français" });
    await expect(pageUi.html).toHaveAttribute("lang", "fr");
    await expect(pageUi.frenchManageSubscriptionsLink).toBeVisible();

    await page.reload();
    await expect(pageUi.html).toHaveAttribute("lang", "fr");
    await expect(pageUi.frenchAccountMenuTrigger).toBeVisible();
  });
});
