import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "./fixtures";
import seedFeeds from "fixtures/seed/feeds.json" with { type: "json" };

const ui = (page: Page) => ({
  get locationBar() {
    return page.getByRole("group", { name: "Location" });
  },
  get searchField() {
    return page.getByLabel("Search articles and feeds");
  },
  get navigatorDialog() {
    return page.getByRole("dialog", { name: "Navigator" });
  },
  get openNavigatorButton() {
    return page.getByRole("button", { name: "Open navigator" });
  },
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get tiles() {
    return this.entriesRegion.locator("[data-entry-id] > div > a");
  },
  get firstEntryLink() {
    return this.entriesRegion.getByRole("link").first();
  },
  get focusedTile() {
    return this.entriesRegion.locator("a:focus");
  },
  entry(id: string | null | undefined) {
    return this.entriesRegion.locator(`[data-entry-id="${id}"]`);
  },
  get refreshButton() {
    return this.entriesRegion.getByRole("button", { name: "Refresh" });
  },
  freshnessStatus(text: string) {
    return this.entriesRegion.getByRole("status").and(page.getByText(text, { exact: true }));
  },
  // A placeholder on the field from `sm` up, plain text inside the button below it.
  get allArticlesHint() {
    return this.locationBar
      .getByPlaceholder("Search all articles, feeds…")
      .or(this.locationBar.getByText("Search all articles, feeds…"));
  },
  navigatorCategoryButton(name: string) {
    return this.navigatorDialog.getByRole("button", { name, exact: true });
  },
  get navigatorClearSearchButton() {
    return this.navigatorDialog.getByRole("button", { name: "Clear search text" });
  },
  get readerHeading() {
    return page.getByRole("heading", { level: 1 });
  },
  get tooltip() {
    return page.getByRole("tooltip");
  },
  get keepUnreadButton() {
    return page.getByRole("button", { name: "Keep unread" });
  },
  get markReadAndCloseText() {
    return page.getByText("Mark as read and close");
  },
  get clearSearchButton() {
    return page.getByRole("button", { name: "Clear search text" });
  },
  get unreadOnlyToggle() {
    return page.getByRole("button", { name: "Unread only" });
  },
  categoryButton(name: string) {
    return page.getByRole("button", { name, exact: true });
  },
});

const SHOTS_DIR = "/tmp/lire-shots";

// A folder's id is its title, and the router percent-encodes its stream key.
const seedCategoryKey = (label: string): string => {
  const folder = seedFeeds.folders.find((candidate) => label in candidate);
  if (!folder) throw new Error(`No seed category titled "${label}"`);
  return encodeURIComponent(`folder:${label}`);
};

const TECH_NEWS_KEY = seedCategoryKey("Tech");

const shot = async ({
  page,
  project,
  screen,
}: {
  page: Page;
  project: string;
  screen: string;
}): Promise<void> => {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${project}-${screen}.png` });
};

test.describe("the app", () => {
  test("reaches a stream, opens a tile, and reads the entry", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    // The reader only opens as a side panel at `lg` (1024px) and up — "desktop" is the only
    // project at that width, so phone and tablet both still get the full-screen reader below it.
    const belowLg = project !== "desktop";
    const pageUi = ui(page);

    await page.goto("/");

    // "/" redirects into the all-entries stream, the one scope without a chip: the field's
    // placeholder names it instead.
    await expect(page).toHaveURL(/\/stream\/all$/);
    await expect(pageUi.locationBar).toBeVisible();
    await expect(pageUi.allArticlesHint).toBeVisible();

    await expect(pageUi.entriesRegion).toBeVisible();

    // A tile holds two links inside its sliding mover: the card first in DOM order, then the
    // title.
    const firstTile = pageUi.tiles.first();
    await expect(firstTile).toBeVisible();
    const tileText = (await firstTile.getAttribute("aria-label"))?.trim() ?? "";
    expect(tileText.length).toBeGreaterThan(0);
    await shot({ page, project, screen: "stream" });

    // The freshness row above the grid: the age of the data, and a Refresh button naming its key.
    await expect(pageUi.refreshButton).toHaveAttribute("aria-keyshortcuts", "R");
    await expect(pageUi.freshnessStatus("Updated just now")).toBeVisible();

    await firstTile.click();

    await expect(pageUi.readerHeading).toBeVisible();
    await expect(pageUi.readerHeading).not.toHaveText("");
    await shot({ page, project, screen: "entry" });

    // The panel has no Close button: the two round buttons in its header are the only exits, and
    // they name the state the entry opened in. The stream opens unread-only, so it opened unread.
    if (belowLg) {
      await expect(pageUi.entriesRegion).toBeHidden();
      await pageUi.keepUnreadButton.click();
      await expect(pageUi.entriesRegion).toBeVisible();
      await expect(pageUi.readerHeading).toBeHidden();
    } else {
      // At `lg`+ the panel floats over the grid, which keeps its full width, and the scrim names
      // what a click on it (or Escape) does.
      await expect(pageUi.entriesRegion).toBeVisible();
      await expect(pageUi.markReadAndCloseText).toBeVisible();

      // Escape takes the "Mark as read" exit, and in an unread-only view the card then leaves.
      const openedId = await firstTile.evaluate((element) =>
        element.closest("[data-entry-id]")?.getAttribute("data-entry-id"),
      );
      await page.keyboard.press("Escape");
      await expect(pageUi.readerHeading).toBeHidden();
      await expect(pageUi.entriesRegion).toBeVisible();
      await expect(pageUi.entry(openedId)).toHaveCount(0);
    }
  });

  test("finds a category through the Navigator, then a feed inside it", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    // Below `sm` (412px, "pixel-9-pro") the location bar is a button that opens the Navigator as
    // a full-height bottom sheet. From `sm` up — "ipad-air-4" at 820px included — the bar is the
    // search field itself, with an anchored popover under it: no dialog and no scrim.
    const popoverTier = project !== "pixel-9-pro";
    const pageUi = ui(page);

    await page.goto("/");

    if (popoverTier) {
      await expect(pageUi.navigatorDialog).toHaveCount(0);
      await pageUi.searchField.click();
      // The tree's rows only appear once the feeds fixture resolve — wait
      // for one before typing, or the query below could filter over an empty tree.
      await expect(pageUi.categoryButton("Tech")).toBeVisible();
      await shot({ page, project, screen: "navigator" });

      await pageUi.searchField.fill("tech");
      // Typing keeps the tree browsable below the matches, so "Tech" holds two rows: the
      // match first, the tree row under the divider.
      await pageUi.categoryButton("Tech").first().click();

      // Picking the category keeps the typed text as that stream's article search — and the
      // category rides in the URL as one segment, its id's last, not the full stream id.
      await expect(page).toHaveURL(new RegExp(`/stream/${TECH_NEWS_KEY}\\?`));
      await expect(pageUi.locationBar).toContainText("Tech");
      await expect(pageUi.searchField).toHaveValue("tech");

      await expect(pageUi.firstEntryLink).toBeVisible();

      // Clearing the text drops `q` and reopens the tree, with the current group expanded.
      await pageUi.clearSearchButton.click();
      await pageUi.categoryButton("Example Tech Daily").click();

      await expect(pageUi.searchField).toHaveValue("");
      await expect(pageUi.locationBar).toContainText("Example Tech Daily");
      await expect(page).toHaveURL(/\/stream\/feed%3A101$/);
      return;
    }

    await pageUi.openNavigatorButton.click();

    await expect(pageUi.navigatorDialog).toBeVisible();
    await expect(pageUi.navigatorCategoryButton("Tech")).toBeVisible();
    await shot({ page, project, screen: "navigator" });

    await pageUi.searchField.fill("tech");
    await pageUi.navigatorCategoryButton("Tech").first().click();

    await expect(pageUi.navigatorDialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/stream/${TECH_NEWS_KEY}\\?`));
    await expect(pageUi.locationBar).toContainText("Tech");
    await expect(pageUi.locationBar).toContainText("tech");

    await expect(pageUi.firstEntryLink).toBeVisible();

    await pageUi.openNavigatorButton.click();
    await expect(pageUi.navigatorDialog).toBeVisible();
    await pageUi.navigatorClearSearchButton.click();
    await pageUi.navigatorCategoryButton("Example Tech Daily").click();

    await expect(pageUi.navigatorDialog).toBeHidden();
    await expect(pageUi.locationBar).toContainText("Example Tech Daily");
    await expect(page).toHaveURL(/\/stream\/feed%3A101$/);
  });

  test("moves between cards with the arrow keys and marks one read with M", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");

    const tiles = pageUi.tiles;
    await expect(tiles.first()).toBeVisible();
    const count = await tiles.count();
    expect(count).toBeGreaterThan(2);

    // Roving tabindex: the first card is the grid's one tab stop.
    await tiles.first().focus();
    await page.keyboard.press("ArrowDown");
    const focused = pageUi.focusedTile;
    await expect(focused).toHaveCount(1);
    const focusedId = await focused.evaluate((element) =>
      element.closest("[data-entry-id]")?.getAttribute("data-entry-id"),
    );
    expect(focusedId).toBeTruthy();
    const firstId = await tiles
      .first()
      .evaluate((element) => element.closest("[data-entry-id]")?.getAttribute("data-entry-id"));
    expect(focusedId).not.toBe(firstId);

    // The stream opens unread-only, so a card marked read leaves the grid and hands focus on.
    await page.keyboard.press("m");
    await expect(pageUi.entry(focusedId)).toHaveCount(0);
    await expect(tiles).toHaveCount(count - 1);
    await expect(pageUi.focusedTile).toHaveCount(1);

    // R refetches the first page: the cards stay, and the age resets once the new page lands.
    await page.keyboard.press("r");
    await expect(pageUi.freshnessStatus("Updated just now")).toBeVisible();
    await expect(tiles.first()).toBeVisible();
  });

  test("shows a tooltip on hover and hides it on Escape", async ({ page }, testInfo) => {
    // Hover is a pointer-fine affair: the phone and tablet projects run with touch.
    test.skip(testInfo.project.name !== "desktop", "hover only");
    const pageUi = ui(page);
    await page.goto("/");

    const toggle = pageUi.unreadOnlyToggle;
    await expect(toggle).toBeVisible();
    await expect(pageUi.tooltip).toBeHidden();

    await toggle.hover();
    await expect(pageUi.tooltip).toBeVisible();
    // The stream opens unread-only, so the toggle offers the other state.
    await expect(pageUi.tooltip).toHaveText("Show all articles");
    // Anchored under the toggle, centred on it.
    const [toggleBox, tipBox] = await Promise.all([
      toggle.boundingBox(),
      pageUi.tooltip.boundingBox(),
    ]);
    expect(toggleBox).not.toBeNull();
    expect(tipBox).not.toBeNull();
    if (toggleBox && tipBox) {
      expect(tipBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
      const toggleCentre = toggleBox.x + toggleBox.width / 2;
      expect(Math.abs(tipBox.x + tipBox.width / 2 - toggleCentre)).toBeLessThan(2);
    }

    await page.keyboard.press("Escape");
    await expect(pageUi.tooltip).toBeHidden();
  });
});
