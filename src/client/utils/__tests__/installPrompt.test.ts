import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenForInstallPrompt, useInstallPrompt } from "client/utils/installPrompt";

const fireBeforeInstall = ({
  outcome = "accepted",
}: { outcome?: "accepted" | "dismissed" } = {}) => {
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
};

describe("useInstallPrompt", () => {
  let stop: () => void;

  beforeEach(() => {
    stop = listenForInstallPrompt();
  });

  afterEach(() => {
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    stop();
  });

  it("cannot install until the browser offers the prompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("keeps the event and cancels the browser's own prompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = fireBeforeInstall();
    expect(result.current.canInstall).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it("calls prompt on the kept event and clears it after the choice", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { prompt } = fireBeforeInstall({ outcome: "dismissed" });
    await act(async () => {
      await result.current.install();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.canInstall).toBe(false);
  });

  it("prompts once when install is called twice before the choice", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { prompt } = fireBeforeInstall();
    await act(async () => {
      await Promise.all([result.current.install(), result.current.install()]);
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.canInstall).toBe(false);
  });

  it("clears the event when the app is installed", () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstall();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.canInstall).toBe(false);
  });

  it("reports installed after the app is installed, until a new prompt is offered", () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstall();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.installed).toBe(true);
    fireBeforeInstall();
    expect(result.current.installed).toBe(false);
  });

  it("clears the event when the prompt cannot show", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = fireBeforeInstall();
    Object.assign(event, {
      prompt: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("spent")),
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.canInstall).toBe(false);
  });

  it("keeps the offer after the prompt is spent, until the app is installed", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstall({ outcome: "dismissed" });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.offered).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.offered).toBe(false);
    expect(result.current.installed).toBe(true);
  });

  it("does nothing when called without a kept event", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.canInstall).toBe(false);
  });

  it("stops listening once the listener is removed", () => {
    const { result } = renderHook(() => useInstallPrompt());
    stop();
    fireBeforeInstall();
    expect(result.current.canInstall).toBe(false);
    stop = listenForInstallPrompt();
  });
});
