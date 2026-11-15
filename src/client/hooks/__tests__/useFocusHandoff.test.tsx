import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFocusHandoff } from "../useFocusHandoff";

const card = (id: string): HTMLDivElement => {
  const element = document.createElement("div");
  element.dataset.entryId = id;
  element.innerHTML = `<a href="#${id}">${id}</a>`;
  return element;
};

const frameWith = (ids: string[]): HTMLElement => {
  const frame = document.createElement("div");
  frame.append(...ids.map(card));
  document.body.append(frame);
  return frame;
};

const linkOf = (id: string): HTMLAnchorElement => {
  const link = document.querySelector<HTMLAnchorElement>(`[data-entry-id="${id}"] a`);
  if (!link) throw new Error(`no card ${id}`);
  return link;
};

const renderHandoff = (frame: HTMLElement | null) =>
  renderHook(({ frame: current }) => useFocusHandoff({ frame: current }), {
    initialProps: { frame },
  });

describe("useFocusHandoff", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("focuses the first link of the requested card", () => {
    const frame = frameWith(["a", "b"]);
    const { result } = renderHandoff(frame);
    act(() => {
      result.current("b");
    });
    expect(linkOf("b")).toHaveFocus();
  });

  it("refocuses the card when the same id is requested again", () => {
    const frame = frameWith(["a", "b"]);
    const { result } = renderHandoff(frame);
    act(() => {
      result.current("b");
    });
    act(() => {
      linkOf("a").focus();
    });
    act(() => {
      result.current("b");
    });
    expect(linkOf("b")).toHaveFocus();
  });

  it("does nothing for a missing card, and never replays it once the card appears", () => {
    const frame = frameWith(["a"]);
    const { result, rerender } = renderHandoff(frame);
    act(() => {
      result.current("late");
    });
    expect(document.activeElement).toBe(document.body);
    frame.append(card("late"));
    rerender({ frame });
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing while the frame is null, and never replays it once the frame arrives", () => {
    const frame = frameWith(["a"]);
    const { result, rerender } = renderHandoff(null);
    act(() => {
      result.current("a");
    });
    rerender({ frame });
    expect(document.activeElement).toBe(document.body);
  });

  it("does not refocus an old request when only the frame changes", () => {
    const frame = frameWith(["a", "b"]);
    const { result, rerender } = renderHandoff(frame);
    act(() => {
      result.current("b");
    });
    act(() => {
      linkOf("a").focus();
    });
    const next = frameWith(["a", "b"]);
    rerender({ frame: next });
    expect(linkOf("a")).toHaveFocus();
    expect(next.querySelector('[data-entry-id="b"] a')).not.toHaveFocus();
  });
});
