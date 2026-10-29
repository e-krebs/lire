import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useElementHeight } from "../useElementHeight";

const ui = {
  height(px: number) {
    return screen.getByText(`${px}px`);
  },
};

const Frame = () => {
  const { attach, height } = useElementHeight();
  return <div ref={attach}>{`${height}px`}</div>;
};

type Resize = () => void;

// Each test sets its own offsetHeight; the setup file restores the prototype afterwards.
const setup = ({ initialHeight, observe = true }: { initialHeight: number; observe?: boolean }) => {
  const observer = { resize: undefined as Resize | undefined, disconnect: vi.fn<() => void>() };
  const offset = { height: initialHeight };
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => offset.height,
  });
  if (observe) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: Resize) {
          observer.resize = callback;
        }
        observe(): void {}
        disconnect(): void {
          observer.disconnect();
        }
      },
    );
  } else {
    vi.stubGlobal("ResizeObserver", undefined);
  }
  const view = render(<Frame />);
  const resize = (height: number): void => {
    offset.height = height;
    act(() => {
      observer.resize?.();
    });
  };
  return { view, resize, disconnect: observer.disconnect };
};

describe("useElementHeight", () => {
  it("measures on mount", () => {
    setup({ initialHeight: 240 });

    expect(ui.height(240)).toBeInTheDocument();
  });

  it("follows the observed height, committed in the same pass", () => {
    const { resize } = setup({ initialHeight: 240 });

    resize(312);

    expect(ui.height(312)).toBeInTheDocument();
  });

  it("keeps the last height while the element is hidden", () => {
    const { resize } = setup({ initialHeight: 240 });

    resize(0);

    expect(ui.height(240)).toBeInTheDocument();
  });

  it("measures once and observes nothing without ResizeObserver", () => {
    setup({ initialHeight: 180, observe: false });

    expect(ui.height(180)).toBeInTheDocument();
  });

  it("stops observing on unmount", () => {
    const { view, disconnect } = setup({ initialHeight: 240 });

    view.unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
