import { expect, test } from "./fixtures";

// The boxes are screen-reader only, so the taps land on their labels.
const ui = (page: import("@playwright/test").Page) => ({
  get card() {
    return page.getByRole("region", { name: "Get started with Lire" });
  },
  get newsletterCheckbox() {
    return page.getByRole("checkbox", { name: "Find your newsletter address" });
  },
  get newsletterRow() {
    return page.locator("label").filter({ has: this.newsletterCheckbox });
  },
  get dismissButton() {
    return page.getByRole("button", { name: "Dismiss the checklist" });
  },
  get accountMenuTrigger() {
    return page.getByRole("button", { name: "Account and app info" });
  },
  get showChecklistButton() {
    return page.getByRole("button", { name: "Show checklist" });
  },
  get categoriesCheckbox() {
    return page.getByRole("checkbox", { name: "Browse your categories" });
  },
  get openCategoriesLink() {
    return page.getByRole("link", { name: "Manage categories" });
  },
  get browseButton() {
    return page.getByRole("button", { name: "Browse", exact: true });
  },
  get changeLanguageButton() {
    return page.getByRole("button", { name: "Change language" });
  },
  get addFeedCheckbox() {
    return page.getByRole("checkbox", { name: "Add your first feed" });
  },
  get addFeedRow() {
    return page.locator("label").filter({ has: this.addFeedCheckbox });
  },
  get addFeedLink() {
    return page.getByRole("link", { name: "Add a feed" });
  },
  get accountMenu() {
    return page.locator("div.account-menu");
  },
  // In row order: the mark-as-read row, then the original-site row.
  get seeHowButton() {
    return page.getByRole("button", { name: "See how" }).first();
  },
  get originalSiteSeeHowButton() {
    return page.getByRole("button", { name: "See how" }).nth(1);
  },
  get originalSiteDialog() {
    return page.getByRole("dialog", { name: "Open stories on their site" });
  },
  get originalSiteToggle() {
    return this.originalSiteDialog.getByRole("checkbox", { name: "Opens on its site" });
  },
  get firstTile() {
    return page.locator("[data-entry-id]").first();
  },
  get sampleOne() {
    return this.howDialog.getByRole("button", { name: /Sample story one/ });
  },
  get sampleTile() {
    return this.howDialog.locator("[data-preview]").first();
  },
  get sampleMark() {
    return this.sampleTile.getByRole("button", { name: /Mark as/ });
  },
  get sampleReset() {
    return this.howDialog.getByRole("button", { name: "Reset" });
  },
  get howDialog() {
    return page.getByRole("dialog", { name: "Mark stories as read" });
  },
  get howScrollPane() {
    return this.howDialog.locator("[data-how-scroll]");
  },
  get howNext() {
    return this.howDialog.getByRole("button", { name: "Next" });
  },
  get searchField() {
    return page.getByLabel("Search articles and feeds");
  },
  get languageSelect() {
    return page.locator("[data-account-menu-language]");
  },
});

// Below the `sm` breakpoint the See how dialog is the whole screen, with no backdrop to click.
const isPhone = (page: import("@playwright/test").Page): boolean => {
  const viewport = page.viewportSize();
  return viewport !== null && viewport.width < 640;
};

const storedOnboarding = async (page: import("@playwright/test").Page) =>
  (await page.evaluate(() => window.localStorage.getItem("lire.fixture.onboarding"))) ?? "";

test.describe("the onboarding checklist", () => {
  test("persists progress, dismisses, and can be restored from the account menu", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");

    await expect(pageUi.card).toBeVisible();

    await pageUi.newsletterRow.click();
    // The fixture transport answers after a delay, so wait for the write before reloading.
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem("lire.fixture.onboarding")))
      .toContain('"newsletter":true');
    await page.reload();
    await expect(pageUi.newsletterCheckbox).toBeChecked();

    await pageUi.dismissButton.click();
    await expect(pageUi.card).toBeHidden();

    await pageUi.accountMenuTrigger.click();
    await pageUi.showChecklistButton.click();
    await expect(pageUi.card).toBeVisible();
    await expect(pageUi.showChecklistButton).toBeHidden();
    // Visible but still in the dismiss flight would pass toBeVisible, so check it is live.
    await expect(pageUi.card).toHaveCSS("opacity", "1");
    await expect(pageUi.card).not.toHaveAttribute("inert");

    await pageUi.newsletterRow.click();
    await expect(pageUi.newsletterCheckbox).not.toBeChecked();
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem("lire.fixture.onboarding")))
      .not.toContain('"newsletter":true');
  });

  test("a navigating row is a link that opens its panel, and ticks nothing", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await expect(pageUi.openCategoriesLink).toHaveAttribute(
      "href",
      "/subscriptions?tab=categories",
    );
    await pageUi.openCategoriesLink.click();
    await expect(page).toHaveURL(/\/subscriptions\?tab=categories$/);
    expect(await storedOnboarding(page)).not.toContain('"folders":true');
  });

  test("Browse opens the navigator and Change language opens the account menu, ticking nothing", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await pageUi.browseButton.click();
    await expect(pageUi.searchField).toBeFocused();
    await expect(pageUi.categoriesCheckbox).not.toBeChecked();
    expect(await storedOnboarding(page)).not.toContain('"categories":true');

    await page.keyboard.press("Escape");
    await pageUi.changeLanguageButton.click();
    await expect(pageUi.languageSelect).toBeFocused();
    // Anchored to the cog, not left at the top-left corner of the viewport.
    const [menu, trigger] = await Promise.all([
      pageUi.accountMenu.boundingBox(),
      pageUi.accountMenuTrigger.boundingBox(),
    ]);
    expect(menu).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(Math.abs(menu!.x + menu!.width - (trigger!.x + trigger!.width))).toBeLessThan(2);
    expect(await storedOnboarding(page)).not.toContain('"language":true');
  });

  test("the add-a-feed row ticks by hand, and its link ticks nothing", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await expect(pageUi.addFeedCheckbox).toBeEnabled();
    await pageUi.addFeedRow.click();
    await expect(pageUi.addFeedCheckbox).toBeChecked();
    await expect.poll(async () => storedOnboarding(page)).toContain('"addFeed":true');

    await pageUi.addFeedRow.click();
    await expect(pageUi.addFeedCheckbox).not.toBeChecked();
    await expect.poll(async () => storedOnboarding(page)).not.toContain('"addFeed":true');

    await pageUi.addFeedLink.click();
    await expect(page).toHaveURL(/\/subscriptions\?add=true$/);
    expect(await storedOnboarding(page)).not.toContain('"addFeed":true');
  });

  test("See how opens sample stories in a dialog, and returns focus on Escape", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await pageUi.seeHowButton.click();
    await expect(pageUi.howDialog).toBeVisible();
    await expect(pageUi.howDialog).toContainText("Sample story three");
    await page.keyboard.press("Escape");
    await expect(pageUi.howDialog).toBeHidden();
    await expect(pageUi.seeHowButton).toBeFocused();
    expect(await storedOnboarding(page)).not.toContain('"markAsRead":true');
  });

  test("See how on the original-site row explains the switch, and ticks nothing on its own", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await pageUi.originalSiteSeeHowButton.click();
    await expect(pageUi.originalSiteDialog).toBeVisible();
    const toggle = pageUi.originalSiteToggle;
    await expect(toggle).not.toBeChecked();
    await pageUi.originalSiteDialog.getByText("Opens on its site").click();
    await expect(toggle).toBeChecked();
    expect(await storedOnboarding(page)).not.toContain('"originalSite":true');

    await page.keyboard.press("Escape");
    await expect(pageUi.originalSiteDialog).toBeHidden();
    await expect(pageUi.originalSiteSeeHowButton).toBeFocused();
    expect(await storedOnboarding(page)).not.toContain('"originalSite":true');
  });

  test("the sample cards leave as they are marked read, and Reset restores them once all have gone", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();
    // The grid remounts its body when its entry count settles, which would take the open dialog with it.
    await expect(pageUi.firstTile).toBeVisible();

    await pageUi.seeHowButton.click();
    await expect(pageUi.sampleTile).not.toHaveAttribute("data-read");
    await expect
      .poll(async () => {
        const first = await pageUi.sampleOne.boundingBox();
        await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return JSON.stringify([first, await pageUi.sampleOne.boundingBox()]);
      })
      .toMatch(/^\[(\{[^}]*\}),\1\]$/);
    await pageUi.sampleOne.click();
    await expect(pageUi.sampleOne).toBeVisible();
    await expect(pageUi.sampleReset).toHaveCount(0);

    await pageUi.sampleMark.click();
    await expect(pageUi.sampleOne).toBeHidden();
    const two = pageUi.howDialog.getByRole("button", { name: /Sample story two/ });
    await two.focus();
    await page.keyboard.press("m");
    await expect(two).toBeHidden();
    await expect(pageUi.sampleReset).toHaveCount(0);

    await pageUi.sampleMark.click();
    await expect(pageUi.sampleReset).toBeVisible();
    await pageUi.sampleReset.click();
    await expect(pageUi.sampleOne).toBeVisible();
    await expect(pageUi.sampleTile).not.toHaveAttribute("data-read");
    await expect(pageUi.sampleReset).toHaveCount(0);
    expect(await storedOnboarding(page)).not.toContain('"markAsRead":true');
  });

  test("See how closes on a click on the backdrop, not on the dialog padding", async ({ page }) => {
    test.skip(isPhone(page), "a phone's dialog fills the screen, with no backdrop");
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();
    // The grid remounts its body when its entry count settles, which would take the open dialog with it.
    await expect(pageUi.firstTile).toBeVisible();

    await pageUi.seeHowButton.click();
    await expect(pageUi.howDialog).toBeVisible();
    await expect.poll(async () => pageUi.howDialog.boundingBox()).not.toBeNull();
    const box = await pageUi.howDialog.boundingBox();
    if (!box) throw new Error("the sample stories dialog has no box");

    await page.mouse.click(box.x + box.width / 2, box.y + 4);
    await expect(pageUi.howDialog).toBeVisible();

    // The left gutter, at mid-height: a dialog taller than the viewport leaves no room below it.
    await page.mouse.click(box.x / 2, box.y + box.height / 2);
    await expect(pageUi.howDialog).toBeHidden();
    await expect(pageUi.seeHowButton).toBeFocused();
  });

  test("See how fills a phone's screen", async ({ page }) => {
    test.skip(!isPhone(page), "only a phone's dialog fills the screen");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the page has no viewport");
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();
    await expect(pageUi.firstTile).toBeVisible();

    await pageUi.seeHowButton.click();
    await expect(pageUi.howDialog).toBeVisible();
    const box = await pageUi.howDialog.boundingBox();
    expect(box?.width).toBe(viewport.width);
    expect(box?.height).toBe(viewport.height);
  });

  test("on a phone the Next button stays at the bottom while the tab content scrolls", async ({
    page,
  }) => {
    test.skip(
      !isPhone(page),
      "only a phone's dialog is full screen, with the footer below the content",
    );
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the page has no viewport");
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();
    await expect(pageUi.firstTile).toBeVisible();

    await page.setViewportSize({ width: viewport.width, height: 560 });
    await pageUi.seeHowButton.click();
    await expect(pageUi.howDialog).toBeVisible();
    const pane = pageUi.howScrollPane;
    await expect
      .poll(async () => pane.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);
    const before = await pageUi.howNext.boundingBox();

    await pane.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const after = await pageUi.howNext.boundingBox();
    expect(after?.y).toBeCloseTo(before?.y ?? Number.NaN, 0);
    expect((after?.y ?? Number.NaN) + (after?.height ?? 0)).toBeLessThanOrEqual(560);
  });

  test("the See how tabs switch between Mosaic and Reader, and the arrow keys move between them", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();
    await expect(pageUi.firstTile).toBeVisible();

    await pageUi.seeHowButton.click();
    const mosaicTab = pageUi.howDialog.getByRole("tab", { name: "Mosaic" });
    await expect(mosaicTab).toHaveAttribute("aria-selected", "true");
    await pageUi.howDialog.getByRole("tab", { name: "Reader" }).click();
    await expect(pageUi.howDialog.getByRole("tabpanel", { name: "Reader" })).toContainText(
      "Press Esc",
    );
    await expect(pageUi.sampleTile).toBeHidden();

    await page.keyboard.press("ArrowLeft");
    await expect(mosaicTab).toBeFocused();
    await expect(pageUi.sampleTile).toBeVisible();
  });

  test("the dismiss flight ends centred on the account menu toggle", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.card).toBeVisible();

    await pageUi.dismissButton.click();
    // Jumped to its end state, so a slow runner cannot unmount the card before the measure.
    const gap = await page.evaluate(() => {
      const centre = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };
      const move = document
        .getAnimations()
        .find(
          (animation) =>
            "animationName" in animation && animation.animationName === "toast-absorb-move",
        );
      const cog = document.getElementById("account-menu-trigger");
      const effect = move?.effect;
      const target = effect instanceof KeyframeEffect ? effect.target : null;
      if (!move || !cog || !target) return Number.NaN;
      move.finish();
      const from = centre(target);
      const to = centre(cog);
      return Math.hypot(from.x - to.x, from.y - to.y);
    });
    expect(gap).toBeLessThan(1);
    await expect(pageUi.card).toBeHidden();
  });

  test.describe("when reduced motion is requested", () => {
    test.use({ reducedMotion: "reduce" });

    test("the dismiss only fades", async ({ page }) => {
      const pageUi = ui(page);
      await page.goto("/");
      await expect(pageUi.card).toBeVisible();

      await pageUi.dismissButton.click();
      // Read while the card still flies: a slow runner can unmount it before an animationend.
      const handle = await page.waitForFunction(() => {
        const names = document
          .getAnimations()
          .flatMap((animation) =>
            "animationName" in animation ? [String(animation.animationName)] : [],
          )
          .filter((name) => name.startsWith("toast-absorb"));
        return names.length > 0 ? names : false;
      });
      expect(await handle.jsonValue()).toEqual(["toast-absorb-fade"]);
    });
  });
});
