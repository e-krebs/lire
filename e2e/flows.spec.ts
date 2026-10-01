import { expect, test, type Locator, type Page } from "./fixtures";

const ui = (page: Page) => ({
  get tiles() {
    return page.getByRole("region", { name: "Entries" }).locator("[data-entry-id] > div > a");
  },
  async tileTimes(): Promise<number[]> {
    return page
      .getByRole("region", { name: "Entries" })
      .locator("[data-entry-id] time")
      .evaluateAll((times) => times.map((time) => Date.parse(time.getAttribute("datetime") ?? "")));
  },
  async idOf(locator: Locator): Promise<string | null | undefined> {
    return locator.evaluate((element) =>
      element.closest("[data-entry-id]")?.getAttribute("data-entry-id"),
    );
  },
  get focusedTile() {
    return page.getByRole("region", { name: "Entries" }).locator("a:focus");
  },
  get unreadOnlyToggle() {
    return page.getByRole("button", { name: "Unread only" });
  },
  get oldestFirstToggle() {
    return page.getByRole("button", { name: "Oldest first" });
  },
  get accountMenuTrigger() {
    return page.getByRole("button", { name: "Account and app info" });
  },
  get accountMenu() {
    return page.getByRole("group", { name: "Account and app info" });
  },
  get manageSubscriptionsLink() {
    return page.getByRole("link", { name: "Manage subscriptions" });
  },
  get feedsTab() {
    return page.getByRole("tab", { name: "Feeds ·" });
  },
  get categoriesTab() {
    return page.getByRole("tab", { name: "Categories ·" });
  },
  get addSourcesButton() {
    return page.getByRole("button", { name: "＋ Add sources" });
  },
  get addWebsiteItem() {
    return page.getByRole("button", { name: "Add website" });
  },
  // Below `sm` the Navigator is a bottom sheet behind a button, from `sm` up a popover under the field.
  async openNavigator({ phone }: { phone: boolean }): Promise<Locator> {
    if (phone) {
      await this.openNavigatorButton.click();
      await expect(this.navigatorDialog).toBeVisible();
      return this.navigatorDialog;
    }
    await this.searchField.click();
    return page.locator("body");
  },
  get openNavigatorButton() {
    return page.getByRole("button", { name: "Open navigator" });
  },
  get navigatorDialog() {
    return page.getByRole("dialog", { name: "Navigator" });
  },
  get searchField() {
    return page.getByLabel("Search articles and feeds");
  },
  panel(title: string): Locator {
    return page.getByRole("dialog", { name: title, exact: true });
  },
  complementary(title: string): Locator {
    return page.getByRole("complementary", { name: title, exact: true });
  },
  feedRow(feedUrl: string): Locator {
    return page.getByRole("tabpanel").getByRole("button", { name: feedUrl });
  },
  categoryButton(name: string): Locator {
    return page.getByRole("button", { name, exact: true });
  },
  get goBackButton() {
    return page.getByRole("button", { name: "Go back" });
  },
  unsubscribeConfirmDialog(feedUrl: string): Locator {
    return page.getByRole("dialog", { name: `Unsubscribe from ${feedUrl}?` });
  },
  get header() {
    return page.locator("header").first();
  },
  async pressOnBody(key: string): Promise<void> {
    await page.locator("body").press(key);
  },
  get selected() {
    return page.locator("[data-selected]");
  },
  async selectedLabel(): Promise<string | null> {
    return this.selected.locator("[data-tip]").first().getAttribute("data-tip");
  },
  toggleGroupButton(name: string): Locator {
    return page.getByRole("button", { name: `Toggle ${name}` });
  },
  get locationGroup() {
    return page.getByRole("group", { name: "Location" });
  },
  clearScopeChip(name: string): Locator {
    return page.getByRole("button", { name: `Search everywhere instead of ${name}` });
  },
});

test.describe("flows", () => {
  test("the view toggles switch the unread filter and the sort order", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.tiles.first()).toBeVisible();

    await expect(pageUi.unreadOnlyToggle).toHaveAttribute("aria-pressed", "true");
    await pageUi.unreadOnlyToggle.click();
    await expect(pageUi.unreadOnlyToggle).toHaveAttribute("aria-pressed", "false");
    await expect(pageUi.tiles.first()).toBeVisible();

    const newestFirst = await pageUi.tileTimes();
    expect(newestFirst[0]).toBe(Math.max(...newestFirst));

    await expect(pageUi.oldestFirstToggle).toHaveAttribute("aria-pressed", "false");
    await pageUi.oldestFirstToggle.click();
    await expect(pageUi.oldestFirstToggle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const times = await pageUi.tileTimes();
        return times[0] === Math.min(...times) && times[0] !== newestFirst[0];
      })
      .toBe(true);

    await pageUi.oldestFirstToggle.click();
    await expect(pageUi.oldestFirstToggle).toHaveAttribute("aria-pressed", "false");
    await pageUi.unreadOnlyToggle.click();
    await expect(pageUi.unreadOnlyToggle).toHaveAttribute("aria-pressed", "true");
  });

  test("a feed subscribed in the manager shows in the Navigator until unsubscribed", async ({
    page,
  }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);
    const feedUrl = "https://flows-blog.test/rss";
    const feedPanel = (title: string): Locator =>
      phone ? pageUi.panel(title) : pageUi.complementary(title);

    // The mock backend lives in the page, so every step stays in-app: a reload would reset it.
    await page.goto("/");
    await pageUi.accountMenuTrigger.click();
    await pageUi.manageSubscriptionsLink.click();
    await expect(page).toHaveURL(/\/subscriptions/);

    await pageUi.feedsTab.click();
    await pageUi.addSourcesButton.click();
    await pageUi.addWebsiteItem.click();
    const addPanel = feedPanel("Add a feed");
    await expect(addPanel).toBeVisible();

    const subscribe = addPanel.getByRole("button", { name: "Subscribe" });
    await expect(subscribe).toBeDisabled();
    await addPanel.getByLabel("Feed or site URL").fill(feedUrl);
    await addPanel.getByRole("radio", { name: feedUrl }).check();
    await addPanel.getByRole("checkbox", { name: "Design", exact: true }).check();
    await expect(subscribe).toBeEnabled();
    await subscribe.click();
    await expect(addPanel).toBeHidden();

    const feedRow = pageUi.feedRow(feedUrl);
    await expect(feedRow).toBeVisible();

    const navigatorHas = async (count: number): Promise<void> => {
      await pageUi.goBackButton.click();
      await expect(page).toHaveURL(/\/stream\//);
      const scope = await pageUi.openNavigator({ phone });
      await pageUi.searchField.fill("flows-blog");
      await expect(scope.getByRole("button", { name: feedUrl, exact: true })).toHaveCount(count);
      await page.keyboard.press("Escape");
    };
    await navigatorHas(1);

    await pageUi.accountMenuTrigger.click();
    await pageUi.manageSubscriptionsLink.click();
    await pageUi.feedsTab.click();
    await feedRow.click();
    const openFeedPanel = feedPanel(feedUrl);
    await expect(openFeedPanel).toBeVisible();
    await openFeedPanel.getByRole("button", { name: "Unsubscribe…" }).click();
    const confirm = pageUi.unsubscribeConfirmDialog(feedUrl);
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Unsubscribe", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(feedRow).toHaveCount(0);

    await navigatorHas(0);
  });

  test("the account menu stays on screen and its actions work", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await expect(pageUi.accountMenu).toBeHidden();

    await pageUi.accountMenuTrigger.click();
    await expect(pageUi.accountMenu).toBeVisible();
    await expect(pageUi.accountMenuTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(pageUi.accountMenu.getByText("Mock data")).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    // Polled, since the popover animates in.
    await expect
      .poll(async () => {
        const box = await pageUi.accountMenu.boundingBox();
        if (!box) return false;
        return (
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height
        );
      })
      .toBe(true);

    // A switch in looks, a checkbox underneath. The box is screen-reader only, so the tap lands on
    // its label.
    const barSwitch = pageUi.accountMenu.getByRole("checkbox", { name: "Bar at the bottom" });
    const barLabel = pageUi.accountMenu.locator("label").filter({ hasText: "Bar at the bottom" });
    const headerEdges = async (): Promise<{ top: number; bottom: number }> => {
      const box = await pageUi.header.boundingBox();
      if (!box) throw new Error("Header has no box");
      return { top: Math.round(box.y), bottom: Math.round(box.y + box.height) };
    };
    await expect(barSwitch).not.toBeChecked();
    await barLabel.click();
    await expect(barSwitch).toBeChecked();
    await expect.poll(async () => (await headerEdges()).bottom).toBe(viewport.height);
    await barLabel.click();
    await expect(barSwitch).not.toBeChecked();
    await expect.poll(async () => (await headerEdges()).top).toBe(0);

    // The trigger's own click is the toggle.
    await pageUi.accountMenuTrigger.click();
    await expect(pageUi.accountMenu).toBeHidden();
    await expect(pageUi.accountMenuTrigger).toHaveAttribute("aria-expanded", "false");

    await pageUi.accountMenuTrigger.click();
    await pageUi.accountMenu.getByRole("link", { name: "Manage subscriptions" }).click();
    await expect(page).toHaveURL(/\/subscriptions/);
    await expect(pageUi.accountMenu).toBeHidden();
  });

  test("Escape closes the account menu once focus is inside it", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await pageUi.accountMenuTrigger.click();
    await pageUi.accountMenu.getByRole("checkbox", { name: "Bar at the bottom" }).focus();

    await page.keyboard.press("Escape");
    await expect(pageUi.accountMenu).toBeHidden();
    await expect(pageUi.accountMenuTrigger).toHaveAttribute("aria-expanded", "false", {
      timeout: 2000,
    });
  });

  test.describe("when using keyboard shortcuts", () => {
    test.beforeEach(({ page: _page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "keyboard cases run on desktop only");
    });

    test("slash focuses search, ArrowDown opens the Navigator, arrows move its selection", async ({
      page,
    }) => {
      const pageUi = ui(page);
      await page.goto("/");
      await expect(pageUi.tiles.first()).toBeVisible();
      const techNews = pageUi.categoryButton("Tech News");
      await expect(pageUi.searchField).not.toBeFocused();

      await pageUi.pressOnBody("/");
      await expect(pageUi.searchField).toBeFocused();

      // Focus alone never opens the panel, a key does.
      await page.keyboard.press("Escape");
      await expect(techNews).toBeHidden();
      await pageUi.searchField.focus();
      await expect(techNews).toBeHidden();
      await page.keyboard.press("ArrowDown");
      await expect(techNews).toBeVisible();

      // Browsing opens with no row highlighted, the first ArrowDown lands on the top row.
      await expect(pageUi.selected).toHaveCount(0);
      await page.keyboard.press("ArrowDown");
      await expect(pageUi.selected).toHaveCount(1);
      const top = await pageUi.selectedLabel();
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => pageUi.selectedLabel()).not.toBe(top);
      await page.keyboard.press("ArrowUp");
      await expect.poll(async () => pageUi.selectedLabel()).toBe(top);

      // Walk down to the Tech News group, expand it, then step onto its first feed.
      await expect(async () => {
        await page.keyboard.press("ArrowDown");
        expect(await pageUi.selectedLabel()).toBe("Tech News");
      }).toPass();
      const toggle = pageUi.toggleGroupButton("Tech News");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("ArrowRight");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => pageUi.selectedLabel()).not.toBe("Tech News");
      const feedLabel = (await pageUi.selectedLabel()) ?? "";
      // Out of a feed, ArrowLeft closes the group and lands on its row.
      await page.keyboard.press("ArrowLeft");
      await expect.poll(async () => pageUi.selectedLabel()).toBe("Tech News");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => pageUi.selectedLabel()).toBe(feedLabel);

      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/stream\/feed%3A/);
      await expect(pageUi.locationGroup).toContainText(feedLabel);
      await expect(pageUi.searchField).toBeFocused();
    });

    test("Backspace at the start of the field clears the scope", async ({ page }) => {
      const pageUi = ui(page);
      await page.goto("/");
      await pageUi.searchField.click();
      await pageUi.categoryButton("Tech News").click();
      await expect(page).toHaveURL(/\/stream\/(?!all)/);
      const chip = pageUi.clearScopeChip("Tech News");
      await expect(chip).toBeVisible();

      await pageUi.searchField.focus();
      await pageUi.searchField.press("Home");
      await pageUi.searchField.press("Backspace");
      await expect(page).toHaveURL(/\/stream\/all/);
      await expect(chip).toBeHidden();
      await expect(pageUi.searchField).toBeFocused();
    });

    test("Home and End jump to the grid's first and last card", async ({ page }) => {
      const pageUi = ui(page);
      await page.goto("/");
      await expect(pageUi.tiles.first()).toBeVisible();
      const firstId = await pageUi.idOf(pageUi.tiles.first());
      const lastId = await pageUi.idOf(pageUi.tiles.last());

      await pageUi.tiles.first().focus();
      await page.keyboard.press("End");
      await expect(pageUi.focusedTile).toHaveCount(1);
      expect(await pageUi.idOf(pageUi.focusedTile)).toBe(lastId);

      await page.keyboard.press("Home");
      await expect(pageUi.focusedTile).toHaveCount(1);
      expect(await pageUi.idOf(pageUi.focusedTile)).toBe(firstId);
    });
  });
});
