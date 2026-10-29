import { fireEvent, render as renderUi, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createContext, useContext } from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "client/i18n/locale";
import { OriginalSiteHowTo } from "client/components/app/onboarding/OriginalSiteHowTo";

// The tile links to its story, so the dialog needs a matched route, as in MarkAsReadHowTo.
const SlotContext = createContext<ReactNode>(null);
const Slot = () => <>{useContext(SlotContext)}</>;
const rootRoute = createRootRoute({ component: Slot });
const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/stream/$streamKey" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/stream/all"] }),
});

const WithRouter = ({ children }: { children: ReactNode }) => (
  <SlotContext.Provider value={children}>
    <RouterProvider router={router} />
  </SlotContext.Provider>
);

const render = (ui: ReactElement) => renderUi(ui, { wrapper: WithRouter });

const ui = {
  get dialog() {
    return screen.getByRole("dialog", { name: "Open stories on their site" });
  },
  get switch() {
    return within(this.dialog).getByRole("checkbox", { name: "Opens on its site" });
  },
  get close() {
    return within(this.dialog).getByRole("button", { name: "Close" });
  },
  kbd(name: string) {
    return this.panel(name).querySelector("kbd");
  },
  tab(name: string) {
    return within(this.dialog).getByRole("tab", { name });
  },
  panel(name: string) {
    return within(this.dialog).getByRole("tabpanel", { name });
  },
};

const renderHowTo = ({ returnFocusRef = { current: null } } = {}) => {
  const onClose = vi.fn<() => void>();
  render(<OriginalSiteHowTo open onClose={onClose} returnFocusRef={returnFocusRef} />);
  return { onClose };
};

describe("OriginalSiteHowTo", () => {
  beforeAll(async () => {
    await router.load();
  });

  // The tile's layout takes the dialog's content width, which jsdom does not measure.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 408,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  });

  it("starts on the setup tab with the switch off", () => {
    setLocalePreference("en");
    renderHowTo();

    expect(ui.tab("Set up")).toHaveAttribute("aria-selected", "true");
    expect(ui.switch).not.toBeChecked();
    expect(ui.panel("Set up")).toHaveTextContent("The switch saves at once");
    expect(ui.panel("Set up")).toHaveTextContent("Save changes");
  });

  it("explains the switch in the story tab, and follows it", () => {
    setLocalePreference("en");
    renderHowTo();

    fireEvent.click(ui.switch);
    expect(ui.switch).toBeChecked();
    fireEvent.click(ui.tab("Story"));
    expect(ui.panel("Story")).toHaveTextContent("When enabled, a story opens on its site");

    fireEvent.click(ui.tab("Set up"));
    fireEvent.click(ui.switch);
    fireEvent.click(ui.tab("Story"));
    expect(ui.panel("Story")).toHaveTextContent("When disabled, a story opens in the reader");
  });

  it("names the Enter key for the keyboard way", () => {
    setLocalePreference("en");
    renderHowTo();

    fireEvent.click(ui.tab("Story"));
    expect(ui.kbd("Story")).toHaveTextContent("Enter");
    expect(ui.panel("Story")).toHaveTextContent("Focus a story card");
    expect(ui.panel("Story")).not.toHaveTextContent("title");
  });

  it("closes from its X button", () => {
    setLocalePreference("en");
    const { onClose } = renderHowTo();

    fireEvent.click(ui.close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the See how button that opened it", () => {
    setLocalePreference("en");
    const button = document.createElement("button");
    document.body.append(button);
    const returnFocusRef = { current: button };
    const { rerender } = renderUi(
      <OriginalSiteHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
      { wrapper: WithRouter },
    );
    rerender(
      <OriginalSiteHowTo
        open={false}
        onClose={vi.fn<() => void>()}
        returnFocusRef={returnFocusRef}
      />,
    );
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
