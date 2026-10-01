import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useElementWidth } from "../useElementWidth";

const ui = {
  get unmeasured() {
    return screen.getByText("unmeasured");
  },
  width(px: number) {
    return screen.getByText(`${px}px`);
  },
};

const Frame = () => {
  const { attach, width } = useElementWidth();
  return <div ref={attach}>{width === undefined ? "unmeasured" : `${width}px`}</div>;
};

type Resize = (entries: Array<{ contentRect: { width: number } }>) => void;

// Without an initial width, the frame renders with no ResizeObserver at all.
const setup = ({ initialWidth }: { initialWidth?: number } = {}) => {
  const observer = { resize: undefined as Resize | undefined, disconnect: vi.fn<() => void>() };
  if (initialWidth === undefined) {
    vi.stubGlobal("ResizeObserver", undefined);
  } else {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => DOMRect.fromRect({ width: initialWidth }),
    });
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
  }
  const view = render(<Frame />);
  const resize = (width: number): void => {
    act(() => {
      observer.resize?.([{ contentRect: { width } }]);
    });
  };
  return { view, resize, disconnect: observer.disconnect };
};

describe("useElementWidth", () => {
  it("falls back to a desktop width without ResizeObserver", () => {
    setup();

    expect(ui.width(960)).toBeInTheDocument();
  });

  it("measures on mount and follows the observed width, rounded", () => {
    const { resize } = setup({ initialWidth: 600.4 });
    expect(ui.width(600)).toBeInTheDocument();

    resize(720.6);

    expect(ui.width(721)).toBeInTheDocument();
  });

  it("keeps the last width while the frame is hidden", () => {
    const { resize } = setup({ initialWidth: 0 });
    expect(ui.unmeasured).toBeInTheDocument();

    resize(500);
    resize(0);

    expect(ui.width(500)).toBeInTheDocument();
  });

  it("stops observing on unmount", () => {
    const { view, disconnect } = setup({ initialWidth: 300 });

    view.unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
