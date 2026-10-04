import { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PULL_THRESHOLD, usePullToRefresh } from "../usePullToRefresh";
import type { PullState } from "../usePullToRefresh";

const MIN_REFRESH_MS = 400;
const RETRACT_MS = 200;

interface HarnessProps {
  onRefresh: (args: { edge: "top" | "bottom" }) => Promise<unknown>;
  pullUp?: boolean;
}

const ui = {
  get scroller() {
    return screen.getByTestId("scroller");
  },
  get probe() {
    return screen.getByTestId("probe");
  },
};

let pull: PullState | null = null;

const report = (next: PullState | null): void => {
  pull = next;
};

const Harness = ({ onRefresh, pullUp = false }: HarnessProps) => {
  const { attach, pull: state } = usePullToRefresh({ onRefresh, pullUp });
  useEffect(() => {
    report(state);
  }, [state]);
  return (
    <div data-testid="scroller" className="scroll-pane" style={{ overflow: "auto" }}>
      <div ref={attach} data-testid="probe" />
    </div>
  );
};

interface Geometry {
  scrollTop?: number;
  clientHeight?: number;
  scrollHeight?: number;
}

// jsdom reports every layout box as 0, so the edge checks need the numbers planted.
const setup = ({ onRefresh, pullUp, ...geometry }: HarnessProps & Geometry) => {
  pull = null;
  render(<Harness onRefresh={onRefresh} pullUp={pullUp} />);
  const scroller = ui.scroller;
  const values = { scrollTop: 0, clientHeight: 500, scrollHeight: 1000, ...geometry };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(scroller, key, { value, writable: true, configurable: true });
  }
  return { probe: ui.probe };
};

// The rubber band's curve is the hook's business; a whole pixel pins it closely enough.
const roundedPull = () => pull && { ...pull, distance: Math.round(pull.distance) };

type TouchType = "touchstart" | "touchmove" | "touchend" | "touchcancel";

// jsdom has no TouchEvent constructor that takes touches, so the lists are planted too.
const touch = ({ type, ys }: { type: TouchType; ys: number[] }): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = ys.map((clientY) => ({ clientX: 0, clientY }));
  const ended = type === "touchend" || type === "touchcancel";
  Object.defineProperty(event, "touches", { value: ended ? [] : list });
  Object.defineProperty(event, "changedTouches", { value: list });
  return event;
};

const fire = ({ target, type, ys }: { target: Element; type: TouchType; ys: number[] }): Event => {
  const event = touch({ type, ys });
  fireEvent(target, event);
  return event;
};

// One finger with a horizontal component, for the axis test.
const fireAt = ({
  target,
  type,
  point,
}: {
  target: Element;
  type: TouchType;
  point: { x: number; y: number };
}): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: point.x, clientY: point.y }];
  Object.defineProperty(event, "touches", { value: list });
  Object.defineProperty(event, "changedTouches", { value: list });
  fireEvent(target, event);
  return event;
};

// A macrotask drains the microtasks the settled refresh queues before React reads the state.
const flush = async (ms = 0): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  });
};

const deferred = () => {
  let resolve: (value: string) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<string>((onResolve, onReject) => {
    resolve = onResolve;
    reject = (reason: Error): void => {
      onReject(reason);
    };
  });
  return { promise, resolve, reject };
};

describe("usePullToRefresh", () => {
  it("tracks a damped top pull and slides it back on release when it never armed", async () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [100] });
    expect(roundedPull()).toEqual({
      edge: "top",
      distance: 65,
      armed: false,
      refreshing: false,
      released: false,
    });

    fire({ target: probe, type: "touchend", ys: [100] });
    expect(pull).toEqual({
      edge: "top",
      distance: 0,
      armed: false,
      refreshing: false,
      released: true,
    });
    await flush(RETRACT_MS);
    expect(pull).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("yields like a rubber band: ever less per pixel, never past the cap", () => {
    const { probe } = setup({
      onRefresh: async () => {
        await Promise.resolve();
      },
    });
    fire({ target: probe, type: "touchstart", ys: [0] });
    const distanceAt = (travel: number): number | undefined => {
      fire({ target: probe, type: "touchmove", ys: [travel] });
      return pull?.distance;
    };

    const d50 = distanceAt(50) ?? Number.NaN;
    expect(distanceAt(0)).toBe(0);
    expect(d50).toBeGreaterThan((distanceAt(100) ?? Number.NaN) - d50);
    expect(distanceAt(119)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
    expect(pull?.armed).toBe(true);
    expect(distanceAt(118)).toBeLessThan(PULL_THRESHOLD);
    expect(pull?.armed).toBe(false);
    expect(distanceAt(10_000)).toBeLessThanOrEqual(PULL_THRESHOLD * 1.5);
  });

  it("arms past the threshold and refreshes until the promise settles", async () => {
    const gate = deferred();
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await gate.promise;
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [144] });
    expect(roundedPull()).toEqual({
      edge: "top",
      distance: 80,
      armed: true,
      refreshing: false,
      released: false,
    });

    fire({ target: probe, type: "touchend", ys: [144] });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(pull).toEqual({
      edge: "top",
      distance: PULL_THRESHOLD * 0.75,
      armed: true,
      refreshing: true,
      released: false,
    });

    gate.resolve("done");
    await flush();
    // Settled, but the disc holds its minimum time before it goes.
    expect(pull?.refreshing).toBe(true);
    await flush(MIN_REFRESH_MS);
    expect(pull).toEqual({
      edge: "top",
      distance: 0,
      armed: true,
      refreshing: false,
      released: true,
    });
    await flush(RETRACT_MS);
    expect(pull).toBeNull();
  });

  it("clears the pull when the refresh rejects", async () => {
    const gate = deferred();
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await gate.promise;
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [200] });
    fire({ target: probe, type: "touchend", ys: [200] });
    expect(pull?.refreshing).toBe(true);

    gate.reject(new Error("offline"));
    // The hold and the slide back are two chained timers, so one wait can land between them.
    await flush(MIN_REFRESH_MS);
    await flush(RETRACT_MS);
    expect(pull).toBeNull();
  });

  it("ignores new touches while refreshing", () => {
    const gate = deferred();
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await gate.promise;
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [200] });
    fire({ target: probe, type: "touchend", ys: [200] });

    fire({ target: probe, type: "touchstart", ys: [0] });
    const move = fire({ target: probe, type: "touchmove", ys: [300] });
    fire({ target: probe, type: "touchend", ys: [300] });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(move.defaultPrevented).toBe(false);
    expect(pull?.refreshing).toBe(true);
  });

  it("stays out of the way when the pane is already scrolled", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh, scrollTop: 40 });

    fire({ target: probe, type: "touchstart", ys: [0] });
    const move = fire({ target: probe, type: "touchmove", ys: [200] });
    fire({ target: probe, type: "touchend", ys: [200] });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("leaves a sideways swipe alone even when it drifts down at the top", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fireAt({ target: probe, type: "touchstart", point: { x: 100, y: 300 } });
    const move = fireAt({ target: probe, type: "touchmove", point: { x: 160, y: 306 } });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);

    // Spent: a straight drag down afterwards is the card's, not a pull.
    fireAt({ target: probe, type: "touchmove", point: { x: 200, y: 420 } });
    expect(pull).toBeNull();
  });

  it("leaves a downward scroll alone even when it starts at the top", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [300] });
    const move = fire({ target: probe, type: "touchmove", ys: [100] });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);

    // The gesture is spent: coming back up the pane does not turn it into a pull.
    const back = fire({ target: probe, type: "touchmove", ys: [500] });
    expect(pull).toBeNull();
    expect(back.defaultPrevented).toBe(false);
  });

  it("pulls up at the end of the pane when pullUp is set", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh, pullUp: true, scrollTop: 500 });

    fire({ target: probe, type: "touchstart", ys: [300] });
    const move = fire({ target: probe, type: "touchmove", ys: [156] });
    expect(roundedPull()).toEqual({
      edge: "bottom",
      distance: 80,
      armed: true,
      refreshing: false,
      released: false,
    });
    expect(move.defaultPrevented).toBe(true);

    fire({ target: probe, type: "touchend", ys: [156] });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith({ edge: "bottom" });
  });

  it("passes the top edge to onRefresh for a pull down", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [200] });
    fire({ target: probe, type: "touchend", ys: [200] });
    expect(onRefresh).toHaveBeenCalledWith({ edge: "top" });
  });

  it("leaves a bottom touch alone until it passes the slop", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh, pullUp: true, scrollTop: 500 });

    fire({ target: probe, type: "touchstart", ys: [300] });
    const small = fire({ target: probe, type: "touchmove", ys: [296] });
    expect(small.defaultPrevented).toBe(false);
    expect(pull).toBeNull();

    const past = fire({ target: probe, type: "touchmove", ys: [250] });
    expect(past.defaultPrevented).toBe(true);
    expect(pull?.edge).toBe("bottom");
  });

  it("ignores a pull up when pullUp is off", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh, scrollTop: 500 });

    fire({ target: probe, type: "touchstart", ys: [300] });
    const move = fire({ target: probe, type: "touchmove", ys: [100] });
    fire({ target: probe, type: "touchend", ys: [100] });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores a pull up when the pane is not at the end", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh, pullUp: true, scrollTop: 200 });

    fire({ target: probe, type: "touchstart", ys: [300] });
    const move = fire({ target: probe, type: "touchmove", ys: [100] });
    fire({ target: probe, type: "touchend", ys: [100] });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores multi-touch", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0, 10] });
    const move = fire({ target: probe, type: "touchmove", ys: [200, 210] });
    expect(pull).toBeNull();
    expect(move.defaultPrevented).toBe(false);
  });

  it("slides the pull back on touchcancel without refreshing", async () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [200] });
    expect(pull?.armed).toBe(true);

    fire({ target: probe, type: "touchcancel", ys: [200] });
    expect(pull?.released).toBe(true);
    await flush(RETRACT_MS);
    expect(pull).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("lets a new finger cut a slide back short", () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    });
    const { probe } = setup({ onRefresh });

    fire({ target: probe, type: "touchstart", ys: [0] });
    fire({ target: probe, type: "touchmove", ys: [100] });
    fire({ target: probe, type: "touchend", ys: [100] });
    expect(pull?.released).toBe(true);

    fire({ target: probe, type: "touchstart", ys: [0] });
    expect(pull).toBeNull();
    fire({ target: probe, type: "touchmove", ys: [50] });
    expect(pull?.released).toBe(false);
  });
});
