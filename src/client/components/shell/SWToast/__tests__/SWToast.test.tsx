import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markReadQueue } from "client/api/markReadQueue";
import { registerPwa } from "client/utils/pwaUpdate";
import { SWToast } from "client/components/shell/SWToast";

interface Callbacks {
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
  onRegisteredSW: (
    url: string,
    registration: { update: () => Promise<unknown> } | undefined,
  ) => void;
}

const setup = () => {
  const updateSW = vi.fn<(reloadPage?: boolean) => Promise<void>>().mockResolvedValue(undefined);
  const callbacks: { current?: Callbacks } = {};
  const register = vi.fn<(options: Callbacks & { immediate: boolean }) => typeof updateSW>(
    (options) => {
      callbacks.current = options;
      return updateSW;
    },
  );
  registerPwa({ register });
  const fire = (name: "onNeedRefresh" | "onOfflineReady"): void => {
    act(() => {
      callbacks.current?.[name]();
    });
  };
  return { updateSW, register, callbacks, fire };
};

const ui = {
  get toast() {
    return screen.queryByRole("status");
  },
  get flyingToast() {
    return screen.getByText("A new version is ready.");
  },
  button(name: string) {
    return screen.getByRole("button", { name });
  },
};

describe("SWToast", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stays hidden by default and registers immediately", () => {
    const { register } = setup();
    render(<SWToast />);

    expect(ui.toast).toBeEmptyDOMElement();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
  });

  it("keeps the status element mounted while hidden", () => {
    setup();
    render(<SWToast />);

    expect(ui.toast).toBeInTheDocument();
  });

  it("flushes the read marks, then applies the update on Reload", async () => {
    const order: string[] = [];
    vi.spyOn(markReadQueue, "flush").mockImplementation(async () => {
      await Promise.resolve();
      order.push("flush");
    });
    vi.stubGlobal("navigator", {
      languages: ["en"],
      serviceWorker: {
        controller: {},
        getRegistration: async () => {
          await Promise.resolve();
          return { waiting: {} };
        },
      },
    });
    const { updateSW, fire } = setup();
    updateSW.mockImplementation(async () => {
      await Promise.resolve();
      order.push("update");
    });
    render(<SWToast />);
    fire("onNeedRefresh");

    await userEvent.click(ui.button("Reload"));

    expect(updateSW).toHaveBeenCalledWith(true);
    expect(order).toEqual(["flush", "update"]);
  });

  it("keeps the toast through the flight on Later, then hides it when the fade ends", async () => {
    const { fire } = setup();
    render(<SWToast />);
    fire("onNeedRefresh");

    await userEvent.click(ui.button("Later"));

    expect(ui.flyingToast).toBeInTheDocument();
    // Without AnimationEvent, jsdom makes React listen to the prefixed name, and the name is set by hand.
    const end = new Event("webkitAnimationEnd", { bubbles: true });
    Object.defineProperty(end, "animationName", { value: "toast-absorb-fade" });
    fireEvent(ui.flyingToast, end);
    expect(ui.toast).toBeEmptyDOMElement();
  });

  it("shows the toast again when another update arrives after Later", async () => {
    const { fire } = setup();
    render(<SWToast />);
    fire("onNeedRefresh");
    await userEvent.click(ui.button("Later"));
    const end = new Event("webkitAnimationEnd", { bubbles: true });
    Object.defineProperty(end, "animationName", { value: "toast-absorb-fade" });
    fireEvent(ui.flyingToast, end);
    expect(ui.toast).toBeEmptyDOMElement();

    fire("onNeedRefresh");

    expect(ui.toast).toHaveTextContent("A new version is ready.");
  });

  it("hides on Later even when no animation ends", () => {
    vi.useFakeTimers();
    const { fire } = setup();
    render(<SWToast />);
    fire("onNeedRefresh");

    fireEvent.click(ui.button("Later"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(ui.toast).toBeEmptyDOMElement();
  });

  it("shows the offline notice and dismisses it", async () => {
    const { fire } = setup();
    render(<SWToast />);
    fire("onOfflineReady");
    expect(ui.toast).toHaveTextContent("Lire now opens offline.");

    await userEvent.click(ui.button("Dismiss"));

    expect(ui.toast).toBeEmptyDOMElement();
  });

  it("checks for an update every hour and when the tab becomes visible, swallowing errors", () => {
    vi.useFakeTimers();
    const { callbacks } = setup();
    const update = vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
      throw new Error("offline");
    });
    callbacks.current?.onRegisteredSW("/sw.js", { update });

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
