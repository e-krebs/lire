import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DIRECT_OPEN_STORAGE_KEY } from "client/api/queries";
import { STORAGE_KEY as BAR_POSITION_STORAGE_KEY } from "client/hooks/utils/barPosition";
import { STORAGE_KEY as READER_WIDTH_STORAGE_KEY } from "client/hooks/useResizablePanel";
import { DemoBanner } from "../DemoBanner";

const keys = [DIRECT_OPEN_STORAGE_KEY, BAR_POSITION_STORAGE_KEY, READER_WIDTH_STORAGE_KEY];

const ui = {
  get resetButton() {
    return screen.getByRole("button", { name: "Reset" });
  },
};

describe("DemoBanner", () => {
  // Reset imports the fixture adapter dynamically; loading it here keeps its cold transform out of the test.
  beforeAll(async () => {
    await import("client/api/adapters/fixture");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("clears the stored layout and reloads at the root on Reset", async () => {
    // jsdom's location.assign cannot be spied on directly; the copy only needs `assign`.
    const assign = vi.fn<(url: string) => void>();
    // oxlint-disable-next-line typescript/no-misused-spread
    vi.stubGlobal("location", { ...window.location, assign });
    for (const key of keys) window.localStorage.setItem(key, "x");

    render(<DemoBanner />);
    await userEvent.click(ui.resetButton);

    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/");
    });
    for (const key of keys) expect(window.localStorage.getItem(key)).toBeNull();
  });
});
