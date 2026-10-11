import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MosaicEmptyArt } from "../MosaicGrid/MosaicEmptyArt";

const ui = {
  button(view: RenderResult) {
    return view.getByRole("button");
  },
  labelled(view: RenderResult, name: string) {
    return view.getByRole("button", { name });
  },
  hiddenSrc(view: RenderResult) {
    return view.container.querySelector("img.opacity-0")?.getAttribute("src");
  },
};

const element = (phase: "day" | "dusk") => (
  <QueryClientProvider client={new QueryClient()}>
    <MosaicEmptyArt scene="cat" phase={phase} />
  </QueryClientProvider>
);

const picking = ({ refreshedAt }: { refreshedAt: number }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MosaicEmptyArt phase="day" refreshedAt={refreshedAt} />
  </QueryClientProvider>
);

const sceneOf = (view: RenderResult) =>
  view.container.querySelector("img")?.getAttribute("src")?.split("/").pop()?.split("-light")[0];

describe("MosaicEmptyArt", () => {
  it("labels the button with the scene it would show", () => {
    const view = render(element("day"));
    expect(ui.labelled(view, "Show the dusk scene")).toBeInTheDocument();
    expect(ui.hiddenSrc(view)).toContain("cat-dark");
  });

  it("swaps the visible image and the label on click", async () => {
    const view = render(element("dusk"));
    await userEvent.click(ui.labelled(view, "Show the day scene"));
    expect(ui.labelled(view, "Show the dusk scene")).toBeInTheDocument();
    expect(ui.hiddenSrc(view)).toContain("cat-dark");
  });

  it("swaps on Enter", async () => {
    const view = render(element("day"));
    ui.button(view).focus();
    await userEvent.keyboard("{Enter}");
    expect(ui.labelled(view, "Show the day scene")).toBeInTheDocument();
  });

  it("clears the override when the base phase changes", async () => {
    const view = render(element("day"));
    await userEvent.click(ui.button(view));
    view.rerender(element("dusk"));
    expect(ui.labelled(view, "Show the day scene")).toBeInTheDocument();
  });

  it("does not bring the override back when the base returns to its phase", async () => {
    const view = render(element("day"));
    await userEvent.click(ui.button(view));
    view.rerender(element("dusk"));
    view.rerender(element("day"));
    expect(ui.labelled(view, "Show the dusk scene")).toBeInTheDocument();
    expect(ui.hiddenSrc(view)).toContain("cat-dark");
  });

  it("picks another scene when a refresh lands, and keeps it on an unrelated re-render", () => {
    const view = render(picking({ refreshedAt: 1 }));
    const first = sceneOf(view);
    view.rerender(picking({ refreshedAt: 1 }));
    expect(sceneOf(view)).toBe(first);
    view.rerender(picking({ refreshedAt: 2 }));
    expect(sceneOf(view)).not.toBe(first);
  });
});
