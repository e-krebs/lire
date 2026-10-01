import { expect, test, type Locator, type Page } from "./fixtures";

const SEED_ORDER = ["Tech News", "Design", "Newsletters", "Archive"];
const MOVED_ORDER = ["Design", "Tech News", "Newsletters", "Archive"];

// Below `sm` (640px) the panel is a bottom sheet on a <dialog>; from `sm` up it floats as an
// <aside>. Only pixel-9-pro sits below `sm`.
const ui = (page: Page) => ({
  panel({ phone, title }: { phone: boolean; title: string }): Locator {
    return page.getByRole(phone ? "dialog" : "complementary", { name: title, exact: true });
  },
  categoryRow(label: string): Locator {
    return page.getByRole("tabpanel").getByRole("button", { name: label, exact: true });
  },
  feedRow(label: string): Locator {
    return page.getByRole("tabpanel").getByRole("button", { name: label, exact: true });
  },
  get addSourcesButton() {
    return page.getByRole("button", { name: "＋ Add sources" });
  },
  get addNewsletterItem() {
    return page.getByRole("button", { name: "Add newsletter" });
  },
  get categoriesTab() {
    return page.getByRole("tab", { name: "Categories ·" });
  },
  get feedsTab() {
    return page.getByRole("tab", { name: "Feeds ·" });
  },
  closeButton({ phone, title }: { phone: boolean; title: string }): Locator {
    return this.panel({ phone, title }).getByRole("button", { name: `Close ${title}` });
  },
  deleteModal(title: string): Locator {
    return page.getByRole("dialog", { name: `Delete ${title}?` });
  },
  // The row's count and the panel's subtitle share one text, so they morph, not crossfade. The
  // count is aria-hidden, so it never appears in the row's accessible name, only in its text.
  rowCountText(row: Locator): Locator {
    return row.getByText(/^(\d+ feeds?|No feed)$/);
  },
  reorderHandle(label: string): Locator {
    return page.getByRole("button", { name: `Reorder ${label}` });
  },
  movedAnnouncement(text: string): Locator {
    return page.getByText(text);
  },
  async tabOrder(): Promise<string[]> {
    return (
      await page
        .getByRole("tabpanel")
        .getByRole("button", { name: "Reorder", exact: false })
        .evaluateAll((handles) => handles.map((handle) => handle.getAttribute("aria-label") ?? ""))
    ).map((label) => label.replace(/^Reorder /, ""));
  },
  // The mock backend answers after a delay, and a reload before then drops the write.
  async waitForSavedOrder(): Promise<void> {
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem("lire.fixture.preferences") ?? ""),
      )
      .toContain("categoriesOrderingId");
  },
  async navigatorOrder({ phone }: { phone: boolean }): Promise<void> {
    await page.goto("/");
    if (phone) await this.openNavigatorButton.click();
    else await this.searchField.click();
    const scope = phone ? this.navigatorDialog : page;
    const rows = scope.getByRole("button", { name: new RegExp(`^(${SEED_ORDER.join("|")})$`) });
    // A row's name leaves out its aria-hidden count, its text does not.
    await expect(rows).toHaveText(MOVED_ORDER.map((label) => new RegExp(`^${label}\\d*$`)));
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
});

test.describe("Subscriptions manager", () => {
  test("opens on the categories tab, and a row opens the panel", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);

    await page.goto("/subscriptions");

    await expect(pageUi.categoriesTab).toHaveAttribute("aria-selected", "true");
    await expect(pageUi.feedsTab).toHaveAttribute("aria-selected", "false");

    const techNews = pageUi.categoryRow("Tech News");
    await techNews.focus();
    await techNews.click();

    const panel = pageUi.panel({ phone, title: "Tech News" });
    await expect(panel).toBeVisible();
    const count = await pageUi.rowCountText(techNews).textContent();
    await expect(panel.getByText(count ?? "", { exact: true }).first()).toBeVisible();
    await expect(page).toHaveURL(/[?&]category=/);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    // Polled, since the enter transition slides the panel in from its edge.
    const edges = async (): Promise<{ right: number; bottom: number; width: number }> => {
      const box = await panel.boundingBox();
      if (!box) throw new Error("Panel has no box");
      return {
        right: Math.round(box.x + box.width),
        bottom: Math.round(box.y + box.height),
        width: Math.round(box.width),
      };
    };
    if (phone) {
      // A sheet rises from the bottom edge, full width.
      await expect.poll(edges).toMatchObject({ bottom: viewport.height, width: viewport.width });
    } else {
      // A panel floats on the right edge, narrower than the page.
      await expect.poll(edges).toMatchObject({ right: viewport.width });
      expect((await edges()).width).toBeLessThan(viewport.width / 2);
    }

    await pageUi.closeButton({ phone, title: "Tech News" }).click();
    await expect(panel).toBeHidden();
    await expect(techNews).toBeFocused();
  });

  test("subscribes to a newsletter from the Add sources menu", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);
    const name = "E2E Weekly";

    await page.goto("/subscriptions");
    await pageUi.feedsTab.click();
    await pageUi.addSourcesButton.click();
    await pageUi.addNewsletterItem.click();

    const panel = pageUi.panel({ phone, title: "Add a newsletter" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Generate address" }).click();
    await expect(panel.getByText(/@feedly\.email/)).toBeVisible();
    await panel.getByLabel("Name").fill(name);
    await panel.getByRole("checkbox", { name: "Design", exact: true }).check();
    await panel.getByRole("button", { name: "Subscribe" }).click();

    await expect(panel).toBeHidden();
    await expect(pageUi.feedRow(name)).toBeVisible();
  });

  test("a second row stays clickable while the panel is open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "pixel-9-pro", "The phone sheet is modal, with a scrim");
    const pageUi = ui(page);

    await page.goto("/subscriptions");
    await pageUi.categoryRow("Tech News").click();
    await expect(pageUi.panel({ phone: false, title: "Tech News" })).toBeVisible();

    await pageUi.categoryRow("Design").click();
    const design = pageUi.panel({ phone: false, title: "Design" });
    await expect(design).toBeVisible();
    await expect(pageUi.panel({ phone: false, title: "Tech News" })).toBeHidden();

    // The list's own gutter, left of its rows, is empty space.
    const row = await pageUi.categoryRow("Tech News").boundingBox();
    if (!row) throw new Error("Row has no box");
    await page.mouse.click(row.x - 8, row.y + row.height / 2);
    await expect(design).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]category=/);
    await expect(pageUi.categoryRow("Design")).toBeFocused();
  });

  test("the Add sources menu works from inside a category panel", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);

    await page.goto("/subscriptions");
    await pageUi.categoryRow("Tech News").click();
    const panel = pageUi.panel({ phone, title: "Tech News" });
    await expect(panel).toBeVisible();

    // Escape closes the menu, not the panel behind it.
    await panel.getByRole("button", { name: "＋ Add sources" }).click();
    await expect(pageUi.addNewsletterItem).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pageUi.addNewsletterItem).toBeHidden();
    await expect(panel).toBeVisible();

    // On the phone the sheet is a modal <dialog>, which makes anything outside it inert.
    await panel.getByRole("button", { name: "＋ Add sources" }).click();
    await pageUi.addNewsletterItem.click();
    await expect(pageUi.panel({ phone, title: "Add a newsletter" })).toBeVisible();
  });

  test("the delete modal's button label follows the checkbox", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);

    await page.goto("/subscriptions");

    // The seed has no feed in two categories, so give one a second category first. The mock
    // backend lives in the page, so every step stays in-app: a reload would reset it.
    await pageUi.feedsTab.click();
    await pageUi.feedRow("Example News").click();
    const feedPanel = pageUi.panel({ phone, title: "Example News" });
    await expect(feedPanel).toBeVisible();
    await feedPanel.getByRole("checkbox", { name: "Design", exact: true }).check();
    await feedPanel.getByRole("button", { name: "Save changes" }).click();
    await expect(feedPanel).toBeHidden();

    await pageUi.categoriesTab.click();
    await pageUi.categoryRow("Tech News").click();
    const categoryPanel = pageUi.panel({ phone, title: "Tech News" });
    await expect(categoryPanel).toBeVisible();
    await categoryPanel.getByRole("button", { name: "Delete category…" }).click();

    const modal = pageUi.deleteModal("Tech News");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Delete and move 3 feeds" })).toBeDisabled();

    const moveAll = modal.getByRole("checkbox", {
      name: "Also move the feed that sits in another category",
    });
    await moveAll.check();
    await expect(modal.getByRole("button", { name: "Delete and move 4 feeds" })).toBeVisible();
    await moveAll.uncheck();
    await expect(modal.getByRole("button", { name: "Delete and move 3 feeds" })).toBeVisible();
  });

  test("a category moved by keyboard keeps its place after a reload", async ({
    page,
  }, testInfo) => {
    const phone = testInfo.project.name === "pixel-9-pro";
    const pageUi = ui(page);

    await page.goto("/subscriptions");
    const handle = pageUi.reorderHandle("Design");
    // Handles only show once preferences load.
    await expect(handle).toBeVisible();
    await expect.poll(async () => pageUi.tabOrder()).toEqual(SEED_ORDER);

    await handle.focus();
    await page.keyboard.press("Space");
    await expect(pageUi.movedAnnouncement("Design moved to position 2 of 4.")).toBeAttached();
    // The sensor binds its arrow keys a tick after pickup, so an early press is lost. A repeat is
    // safe: Design stops at the top.
    await expect(async () => {
      await page.keyboard.press("ArrowUp");
      await expect(pageUi.movedAnnouncement("Design moved to position 1 of 4.")).toBeAttached({
        timeout: 500,
      });
    }).toPass();
    await page.keyboard.press("Space");
    await expect.poll(async () => pageUi.tabOrder()).toEqual(MOVED_ORDER);
    await pageUi.waitForSavedOrder();

    await page.reload();
    await expect(pageUi.reorderHandle("Design")).toBeVisible();
    await expect.poll(async () => pageUi.tabOrder()).toEqual(MOVED_ORDER);

    await pageUi.navigatorOrder({ phone });
  });

  test("a category dragged by mouse keeps its place after a reload", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Touch projects drag by keyboard above");
    const pageUi = ui(page);

    await page.goto("/subscriptions");
    const handle = pageUi.reorderHandle("Design");
    await expect(handle).toBeVisible();
    const from = await handle.boundingBox();
    const to = await pageUi.reorderHandle("Tech News").boundingBox();
    if (!from || !to) throw new Error("Handle has no box");

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 4, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => pageUi.tabOrder()).toEqual(MOVED_ORDER);
    await pageUi.waitForSavedOrder();

    await page.reload();
    await expect(pageUi.reorderHandle("Design")).toBeVisible();
    await expect.poll(async () => pageUi.tabOrder()).toEqual(MOVED_ORDER);

    await pageUi.navigatorOrder({ phone: false });
  });
});
