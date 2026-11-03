import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import sprites from "virtual:empty-sprites";
import { EMPTY_SCENES } from "../MosaicGrid/emptyScenes";
import { MosaicEmptyArt } from "../MosaicGrid/MosaicEmptyArt";

const ui = {
  button(view: RenderResult) {
    return view.getByRole("button");
  },
  labelled(view: RenderResult, name: string) {
    return view.getByRole("button", { name });
  },
  hiddenPhase(view: RenderResult) {
    return view.container.querySelector<HTMLElement>(".opacity-0")?.dataset.phase;
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
  view.container.querySelector<HTMLElement>("[data-scene]")?.dataset.scene;

describe("MosaicEmptyArt", () => {
  it("labels the button with the scene it would show", () => {
    const view = render(element("day"));
    expect(ui.labelled(view, "Show the dusk scene")).toBeInTheDocument();
    expect(ui.hiddenPhase(view)).toBe("dusk");
  });

  it("swaps the visible image and the label on click", async () => {
    const view = render(element("dusk"));
    await userEvent.click(ui.labelled(view, "Show the day scene"));
    expect(ui.labelled(view, "Show the dusk scene")).toBeInTheDocument();
    expect(ui.hiddenPhase(view)).toBe("dusk");
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
    expect(ui.hiddenPhase(view)).toBe("dusk");
  });

  it("picks another scene when a refresh lands, and keeps it on an unrelated re-render", () => {
    const view = render(picking({ refreshedAt: 1 }));
    const first = sceneOf(view);
    view.rerender(picking({ refreshedAt: 1 }));
    expect(sceneOf(view)).toBe(first);
    view.rerender(picking({ refreshedAt: 2 }));
    expect(sceneOf(view)).not.toBe(first);
  });

  it("has a sprite cell for every scene", () => {
    expect(Object.keys(sprites.cells).sort()).toEqual([...EMPTY_SCENES].sort());
  });
});
