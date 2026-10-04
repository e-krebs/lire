import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markReadQueue } from "client/api/markReadQueue";
import { dismiss, registerPwa } from "client/utils/pwaUpdate";
import { UpdateToast } from "../UpdateToast";

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
  button(name: string) {
    return screen.getByRole("button", { name });
  },
};

describe("UpdateToast", () => {
  afterEach(() => {
    act(() => {
      dismiss({ kind: "update" });
      dismiss({ kind: "offline" });
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stays hidden by default and registers immediately", () => {
    const { register } = setup();
    render(<UpdateToast />);

    expect(ui.toast).toBeEmptyDOMElement();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
  });

  it("keeps the status element mounted while hidden", () => {
    setup();
    render(<UpdateToast />);

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
    render(<UpdateToast />);
    fire("onNeedRefresh");

    await userEvent.click(ui.button("Reload"));

    expect(updateSW).toHaveBeenCalledWith(true);
    expect(order).toEqual(["flush", "update"]);
  });

  it("hides on Later", async () => {
    const { fire } = setup();
    render(<UpdateToast />);
    fire("onNeedRefresh");
    expect(ui.toast).toHaveTextContent("A new version is ready.");

    await userEvent.click(ui.button("Later"));

    expect(ui.toast).toBeEmptyDOMElement();
  });

  it("shows the offline notice and dismisses it", async () => {
    const { fire } = setup();
    render(<UpdateToast />);
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
