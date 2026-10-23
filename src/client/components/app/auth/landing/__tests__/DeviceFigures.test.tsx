import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceFigures } from "client/components/app/auth/landing/DeviceFigures";
import { listenForInstallPrompt } from "client/utils/installPrompt";

const ui = {
  get figures() {
    return screen.getAllByRole("figure");
  },
  get captions() {
    return this.figures.map((figure) => figure.querySelector("figcaption")?.textContent);
  },
  get columnCounts() {
    return this.figures.map((figure) => figure.querySelectorAll(".landing-col").length);
  },
  get installCopy() {
    return screen.getByText("Install Lire from your browser and it opens like any other app.");
  },
  get installButton() {
    return screen.getByRole("button", { name: /Install Lire/ });
  },
  get installButtonIfAny() {
    return screen.queryByRole("button", { name: /Install Lire/ });
  },
  get androidCopy() {
    return screen.queryByText("Or use the Android app to open links in your browser.");
  },
};

const stubMatchMedia = (matches: (query: string) => boolean): void => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

describe("DeviceFigures", () => {
  it("renders the desktop, tablet and phone captions in order", () => {
    render(<DeviceFigures />);

    expect(ui.captions).toEqual(["Desktop", "Tablet", "Phone"]);
  });

  it("lays each device out with 3, 2 and 1 columns", () => {
    render(<DeviceFigures />);

    expect(ui.columnCounts).toEqual([3, 2, 1]);
  });

  it("shows the install sentence and no Android block", () => {
    render(<DeviceFigures />);

    expect(ui.installCopy).toBeInTheDocument();
    expect(ui.installCopy.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(ui.androidCopy).not.toBeInTheDocument();
  });

  describe("when the browser can install", () => {
    let stop: () => void;

    beforeEach(() => {
      stop = listenForInstallPrompt();
      stubMatchMedia(() => false);
    });

    afterEach(() => {
      act(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });
      stop();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "standalone");
      window.sessionStorage.clear();
    });

    const offerInstall = () => {
      const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      act(() => {
        window.dispatchEvent(
          Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
            prompt,
            userChoice: Promise.resolve({ outcome: "accepted" }),
          }),
        );
      });
      return prompt;
    };

    it("renders the install sentence as a button with the icon", () => {
      offerInstall();
      render(<DeviceFigures />);

      expect(ui.installButton.querySelector("svg")).toBeInTheDocument();
    });

    it("runs the browser prompt when the button is pressed", async () => {
      const prompt = offerInstall();
      render(<DeviceFigures />);

      await userEvent.click(ui.installButton);

      expect(prompt).toHaveBeenCalledOnce();
      await waitFor(() => {
        expect(ui.installButton).toBeDisabled();
      });
    });

    it("shows the line as plain text once installed as an app", () => {
      stubMatchMedia((query) => query === "(display-mode: standalone)");
      offerInstall();
      render(<DeviceFigures />);

      expect(ui.installButtonIfAny).toBeNull();
      expect(ui.installCopy).toBeInTheDocument();
    });

    it("shows the line as plain text on iOS home-screen apps", () => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
      offerInstall();
      render(<DeviceFigures />);

      expect(ui.installButtonIfAny).toBeNull();
    });

    it("shows the line as plain text inside the Android app", () => {
      window.sessionStorage.setItem("lire.twa", "true");
      offerInstall();
      render(<DeviceFigures />);

      expect(ui.installButtonIfAny).toBeNull();
    });

    it("keeps the button in a fullscreen desktop tab", () => {
      stubMatchMedia((query) => query === "(display-mode: fullscreen)");
      offerInstall();
      render(<DeviceFigures />);

      expect(ui.installButton).toBeEnabled();
    });

    it("shows the spent button muted with the default cursor", async () => {
      offerInstall();
      render(<DeviceFigures />);

      await userEvent.click(ui.installButton);

      await waitFor(() => {
        expect(ui.installButton).toBeDisabled();
      });
      expect(ui.installButton).toHaveClass("disabled:text-muted", "disabled:cursor-default");
    });

    it("swaps the button for plain text in the same box after appinstalled", () => {
      offerInstall();
      render(<DeviceFigures />);
      const { className } = ui.installButton;

      act(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });

      expect(ui.installButtonIfAny).toBeNull();
      const line = ui.installCopy.parentElement;
      expect(line?.tagName).toBe("SPAN");
      expect(className).toContain(line?.className ?? "");
      expect(line).toHaveClass("flex", "items-center", "gap-1.5", "text-left");
      expect(line?.querySelector("svg")).toBeInTheDocument();
    });

    it("keeps the line's element, text and layout classes after the prompt is spent", async () => {
      offerInstall();
      render(<DeviceFigures />);
      const before = ui.installButton;
      const { className } = before;

      await userEvent.click(before);

      await waitFor(() => {
        expect(ui.installButton).toBeDisabled();
      });
      expect(ui.installButton).toBe(before);
      expect(ui.installButton).toHaveTextContent(
        "Install Lire from your browser and it opens like any other app.",
      );
      expect(ui.installButton).toHaveClass("flex", "items-center", "gap-1.5", "text-left");
      expect(ui.installButton.className).toBe(className);
    });
  });
});
