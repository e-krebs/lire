import { expect, test, type Page } from "./fixtures";

// The unread-only stream is the only place a card leaves when it turns read, so it is the only
// place the undo strip appears.
const STRIP = "Marked as read";

const ui = (page: Page) => ({
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get tiles() {
    return page.locator("[data-entry-id]");
  },
  get strip() {
    return page.locator(".undo-strip").filter({ hasText: STRIP });
  },
  card(entryId: string | null) {
    return page.locator(`[data-entry-id="${entryId}"]`);
  },
});

test.describe("the undo strip", () => {
  test("undoes a mark as read from the strip, confirms it, then lets the countdown confirm", async ({
    page,
  }) => {
    const pageUi = ui(page);
    await page.goto("/stream/all?unread=true");
    await pageUi.entriesRegion.waitFor();
    await pageUi.tiles.first().waitFor();
    const before = await pageUi.tiles.count();

    const first = pageUi.tiles.first();
    const entryId = await first.getAttribute("data-entry-id");
    const card = pageUi.card(entryId);
    await first.getByRole("button", { name: "Mark as read" }).click({ force: true });
    await expect(pageUi.strip).toHaveCount(1);
    await expect(card).toHaveCount(0);

    await pageUi.strip.getByRole("button", { name: "Undo" }).click();
    await expect(pageUi.strip).toHaveCount(0);
    await expect(card).toHaveCount(1);
    expect(await pageUi.tiles.count()).toBe(before);

    await card.getByRole("button", { name: "Mark as read" }).click({ force: true });
    await pageUi.strip.getByRole("button", { name: "Confirm" }).click();
    await expect(pageUi.strip).toHaveCount(0);
    await expect(card).toHaveCount(0);

    await pageUi.tiles.first().getByRole("button", { name: "Mark as read" }).click({ force: true });
    await expect(pageUi.strip).toHaveCount(1);
    // Hover pauses the clock, and the click left the pointer on the strip.
    await page.mouse.move(0, 0);
    // Focus on Undo, where the strip puts it, does not pause the clock.
    await expect(pageUi.strip.getByRole("button", { name: "Undo" })).toBeFocused();
    await expect(pageUi.strip).toHaveCount(0, { timeout: 8000 });
  });
});
