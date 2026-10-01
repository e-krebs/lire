import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FreshnessRow } from "../FreshnessRow";

const MINUTES_3 = 3 * 60 * 1000;

const ui = {
  get status() {
    return screen.getByRole("status");
  },
  get refreshButton() {
    return screen.getByRole("button", { name: "Refresh" });
  },
  text(content: string) {
    return screen.getByText(content);
  },
};

describe("FreshnessRow", () => {
  it("reads the age of the last update", () => {
    render(<FreshnessRow updatedAt={Date.now()} refreshing={false} onRefresh={() => {}} />);

    expect(ui.status).toHaveTextContent("Updated just now");
  });

  it("counts the minutes once the data ages", () => {
    render(
      <FreshnessRow updatedAt={Date.now() - MINUTES_3} refreshing={false} onRefresh={() => {}} />,
    );

    expect(ui.status).toHaveTextContent("Updated 3 minutes ago");
  });

  it("announces the refresh while it runs", () => {
    render(<FreshnessRow updatedAt={Date.now()} refreshing onRefresh={() => {}} />);

    expect(ui.status).toHaveTextContent("Refreshing…");
    expect(ui.refreshButton).toHaveAttribute("aria-busy", "true");
  });

  it("stays silent until the first update lands", () => {
    render(<FreshnessRow updatedAt={undefined} refreshing={false} onRefresh={() => {}} />);

    expect(ui.status).toHaveTextContent("");
    expect(ui.refreshButton).not.toHaveAttribute("aria-busy");
  });

  it("refreshes on click", async () => {
    const onRefresh = vi.fn<() => void>();
    render(<FreshnessRow updatedAt={Date.now()} refreshing={false} onRefresh={onRefresh} />);

    await userEvent.click(ui.refreshButton);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("names its shortcut and its tooltip on the button", () => {
    render(<FreshnessRow updatedAt={Date.now()} refreshing={false} onRefresh={() => {}} />);

    expect(ui.refreshButton).toHaveAttribute("aria-keyshortcuts", "R");
    expect(ui.refreshButton).toHaveAttribute("data-tip", "Refresh");
  });

  it("renders the caller's own text in the left slot", () => {
    render(
      <FreshnessRow updatedAt={Date.now()} refreshing={false} onRefresh={() => {}}>
        <span>Results for “chipmaker” · 2 articles</span>
      </FreshnessRow>,
    );

    expect(ui.text("Results for “chipmaker” · 2 articles")).toBeInTheDocument();
  });
});
