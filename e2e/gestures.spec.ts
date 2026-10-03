import { expect, test, type Locator, type Page } from "./fixtures";

// The seed holds 38 unread entries and a river page holds 12, so the unread-only default view
// has four pages.
const FIRST_PAGE = 12;
const UNREAD_TOTAL = 40;

const ui = (page: Page) => ({
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get tiles() {
    return this.entriesRegion.locator("[data-entry-id] > div > a");
  },
  freshnessStatus(text: string) {
    return this.entriesRegion.getByRole("status").and(page.getByText(text, { exact: true }));
  },
  get pullIndicator() {
    return page.locator(".pull-indicator");
  },
  // Not scoped to entriesRegion: while the pull is refreshing, this status sits elsewhere in the
  // page than the entries freshness row does. `.and()` on an exact getByText finds nothing here,
  // unlike the entries freshness row, so this keeps the original hasText regex, an
  // RegExp-inside-`ui` gap the doc leaves to review.
  get pullRefreshingStatus() {
    return page.getByRole("status").filter({ hasText: /^Refreshing$/ });
  },
  get readerHeading() {
    return page.getByRole("heading", { level: 1 });
  },
  get resizeHandle() {
    return page.getByRole("separator", { name: "Resize the article panel" });
  },
  panelSection(handle: Locator) {
    return page.locator("section").filter({ has: handle });
  },
});

test.describe("gestures", () => {
  test("pulls down at the top of the grid to refresh it", async ({ page }, testInfo) => {
    // Playwright has no touch drag, so the gesture goes through CDP: Chromium's touch project only.
    test.skip(
      testInfo.project.name !== "pixel-9-pro",
      "touch drag through CDP, Chromium phone only",
    );
    const pageUi = ui(page);
    await page.goto("/");

    await expect(pageUi.tiles.first()).toBeVisible();
    await expect(pageUi.freshnessStatus("Updated just now")).toBeVisible();

    const box = await pageUi.tiles.first().boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const x = box.x + box.width / 2;
    const startY = box.y + 10;

    const cdp = await page.context().newCDPSession(page);
    const touch = (y: number) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(startY) });
    // Past the ~119px of travel that arms the pull, in small steps like a finger.
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: touch(startY + step * 20),
      });
    }
    await expect(pageUi.pullIndicator).toHaveAttribute("data-armed", "true");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    // The disc parks as a status for the refresh's minimum hold, then slides back out.
    await expect(pageUi.pullRefreshingStatus).toBeVisible();
    await expect(pageUi.pullIndicator).toHaveCount(0);
    await expect(pageUi.freshnessStatus("Updated just now")).toBeVisible();
    await expect(pageUi.tiles.first()).toBeVisible();
  });

  test("loads the next page when the grid is scrolled to its end", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");

    await expect(pageUi.tiles.first()).toBeVisible();
    await expect(pageUi.tiles).toHaveCount(FIRST_PAGE);

    // Each scroll to the end loads one more page.
    await expect(async () => {
      await pageUi.tiles.last().scrollIntoViewIfNeeded();
      await pageUi.entriesRegion.evaluate((element) => {
        const pane = element.closest(".scroll-pane") ?? element.querySelector(".scroll-pane");
        pane?.scrollTo({ top: pane.scrollHeight });
      });
      await expect(pageUi.tiles).toHaveCount(UNREAD_TOTAL, { timeout: 1_000 });
    }).toPass();
  });

  test("resizes the reader panel by drag and by keys, and keeps the width", async ({
    page,
  }, testInfo) => {
    // The panel only floats beside the grid, with a handle, at `lg` and up.
    test.skip(testInfo.project.name !== "desktop", "resizable panel at lg+ only");
    const pageUi = ui(page);
    await page.goto("/");

    await pageUi.tiles.first().click();
    await expect(pageUi.readerHeading).toBeVisible();
    const entryUrl = page.url();

    const handle = pageUi.resizeHandle;
    await expect(handle).toHaveAttribute("aria-valuenow", "640");
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const max = viewportWidth - 320;
    await expect(handle).toHaveAttribute("aria-valuemax", String(max));

    // hover() waits for the panel's slide-in to settle, so the box read next is where it stays.
    await handle.hover();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 100, y, { steps: 5 });
    await page.mouse.move(startX - 200, y, { steps: 5 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "840");
    expect(await page.evaluate(() => window.localStorage.getItem("lire.reader.width"))).toBe("840");

    await page.reload();
    await expect(page).toHaveURL(entryUrl);
    await expect(handle).toHaveAttribute("aria-valuenow", "840");

    // Dragged far past the left edge, the panel stops at the viewport minus the grid's share.
    await handle.hover();
    const again = await handle.boundingBox();
    expect(again).not.toBeNull();
    if (!again) return;
    await page.mouse.move(again.x + again.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(0, y, { steps: 10 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", String(max));
    const panelWidth = await pageUi.panelSection(handle).evaluate((element) => {
      return element.getBoundingClientRect().width;
    });
    expect(panelWidth).toBeLessThanOrEqual(max);
    expect(panelWidth).toBeLessThan(viewportWidth);

    await handle.focus();
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "384");
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "400");
    await page.keyboard.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "384");
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", String(max));
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", String(max));

    await page.reload();
    await expect(handle).toHaveAttribute("aria-valuenow", String(max));
  });
});
