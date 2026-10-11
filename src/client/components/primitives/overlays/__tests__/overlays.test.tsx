import { useState } from "react";
import { act, fireEvent, render, waitFor, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "client/components/primitives/overlays/ConfirmDialog";
import { PanelExitContext, SidePanel } from "../SidePanel";

const ui = {
  trigger(name: string) {
    return screen.getByRole("button", { name });
  },
  closeButton(name: string) {
    return screen.getByRole("button", { name: `Close ${name}` });
  },
  button(name: string) {
    return screen.getByRole("button", { name });
  },
  get panel() {
    return screen.getByRole("complementary");
  },
  counter(count: number) {
    return screen.getByRole("button", { name: `count ${count}` });
  },
  get floatingPanel() {
    return screen.getByRole("complementary");
  },
  queryPanel() {
    return screen.queryByRole("complementary");
  },
  hiddenPanel() {
    return screen.getByRole("complementary", { hidden: true });
  },
  heading(name: string) {
    return screen.getByRole("heading", { name });
  },
  queryHeading(name: string) {
    return screen.queryByRole("heading", { name });
  },
  text(content: string) {
    return screen.getByText(content);
  },
  get dialog() {
    return screen.getByRole("dialog");
  },
  hiddenDialog() {
    return screen.getByRole("dialog", { hidden: true });
  },
  namedDialog(name: string) {
    return screen.getByRole("dialog", { name });
  },
};

const PanelHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Josh W. Comeau
      </button>
      <SidePanel
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Josh W. Comeau"
      >
        <p>Body</p>
      </SidePanel>
    </>
  );
};

// Keeps the panel mounted through its exit, as SubscriptionsManager does.
const ExitHarness = () => {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setClosing(false);
        }}
      >
        Josh W. Comeau
      </button>
      {open ? (
        <PanelExitContext
          value={
            closing
              ? () => {
                  setOpen(false);
                  setClosing(false);
                }
              : null
          }
        >
          <SidePanel
            open
            onClose={() => {
              setClosing(true);
            }}
            title="Josh W. Comeau"
          >
            <p>Body</p>
          </SidePanel>
        </PanelExitContext>
      ) : null}
    </>
  );
};

describe("overlays", () => {
  it("plays its exit before it unmounts and hands focus back", async () => {
    let finish = (): void => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // jsdom runs no transitions, so the exit is one that ends on cue.
    Object.defineProperty(HTMLElement.prototype, "getAnimations", {
      configurable: true,
      value: () => [{ finished }],
    });
    const user = userEvent.setup();
    render(<ExitHarness />);
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    await user.click(ui.closeButton("Josh W. Comeau"));
    const panel = ui.hiddenPanel();
    expect(panel).toHaveAttribute("data-closing");
    expect(trigger).not.toHaveFocus();

    await act(async () => {
      finish();
      await finished;
    });
    expect(ui.queryPanel()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses its heading again when its row takes back the close", async () => {
    // An exit that never ends, so the row is pressed while it plays.
    Object.defineProperty(HTMLElement.prototype, "getAnimations", {
      configurable: true,
      value: () => [{ finished: new Promise<void>(() => {}) }],
    });
    const user = userEvent.setup();
    render(<ExitHarness />);
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    await user.click(ui.closeButton("Josh W. Comeau"));
    await user.click(trigger);
    expect(ui.panel).not.toHaveAttribute("data-closing");
    expect(ui.heading("Josh W. Comeau")).toHaveFocus();
  });

  it("focuses its heading on open and hands focus back to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    expect(ui.heading("Josh W. Comeau")).toHaveFocus();

    await user.click(ui.closeButton("Josh W. Comeau"));
    expect(ui.queryHeading("Josh W. Comeau")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(ui.queryPanel()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside it and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PanelHarness />
        <p>Empty space</p>
      </>,
    );
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    await user.click(ui.text("Body"));
    expect(ui.panel).toBeInTheDocument();

    await user.click(ui.text("Empty space"));
    expect(ui.queryPanel()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("stays open under a click on a modal <dialog> over it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PanelHarness />
        <dialog open>
          <button type="button">Cancel</button>
        </dialog>
      </>,
    );

    await user.click(ui.trigger("Josh W. Comeau"));
    await user.click(ui.button("Cancel"));
    expect(ui.panel).toBeInTheDocument();
  });

  it("never takes a control inside a sibling <dialog> as the trigger", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PanelHarness />
        <dialog open>
          <button type="button">Cancel</button>
        </dialog>
      </>,
    );
    const trigger = ui.trigger("Josh W. Comeau");

    await user.click(trigger);
    const cancel = ui.button("Cancel");
    cancel.focus();
    cancel.closest("dialog")?.removeAttribute("open");
    await user.click(ui.closeButton("Josh W. Comeau"));
    expect(trigger).toHaveFocus();
  });

  it("keeps the body's state when the tier changes while open", async () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      matches,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    const Counter = () => {
      const [count, setCount] = useState(0);
      return (
        <button
          type="button"
          onClick={() => {
            setCount(count + 1);
          }}
        >
          {`count ${count}`}
        </button>
      );
    };
    const user = userEvent.setup();
    render(
      <SidePanel open onClose={() => {}} title="Josh W. Comeau">
        <Counter />
      </SidePanel>,
    );
    await user.click(ui.counter(0));

    matches = true;
    act(() => {
      for (const listener of listeners) listener();
    });

    expect(ui.floatingPanel).toContainElement(ui.counter(1));
  });

  describe("when on a phone", () => {
    const setup = () => {
      // No query matches, so useTier reads the phone tier.
      vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    };

    // Unsafe to leave to the global afterEach: an earlier assertion throwing here would leak the
    // stub into later tests in this file.
    afterEach(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
      Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    });

    it("opens as a bottom sheet and closes from its ✕ without showModal", async () => {
      setup();
      const user = userEvent.setup();
      render(<PanelHarness />);

      await user.click(ui.trigger("Josh W. Comeau"));
      expect(ui.namedDialog("Josh W. Comeau")).toHaveAttribute("open");
      expect(ui.heading("Josh W. Comeau")).toHaveFocus();

      await user.click(ui.closeButton("Josh W. Comeau"));
      expect(ui.queryHeading("Josh W. Comeau")).not.toBeInTheDocument();
      expect(ui.hiddenDialog()).not.toHaveAttribute("open");
    });

    it("goes through showModal and reports the dialog's close event", async () => {
      setup();
      const showModal = vi.fn<() => void>(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
      const close = vi.fn<() => void>(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      });
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
        configurable: true,
        value: showModal,
      });
      Object.defineProperty(HTMLDialogElement.prototype, "close", {
        configurable: true,
        value: close,
      });
      const user = userEvent.setup();
      render(<PanelHarness />);

      await user.click(ui.trigger("Josh W. Comeau"));
      expect(showModal).toHaveBeenCalledOnce();
      await user.click(ui.closeButton("Josh W. Comeau"));
      expect(close).toHaveBeenCalledOnce();
      expect(ui.queryHeading("Josh W. Comeau")).not.toBeInTheDocument();
    });

    it("closes the sheet itself when its owner plays the exit", async () => {
      setup();
      const user = userEvent.setup();
      render(<ExitHarness />);

      await user.click(ui.trigger("Josh W. Comeau"));
      await user.click(ui.closeButton("Josh W. Comeau"));

      await waitFor(() => {
        expect(ui.queryPanel()).not.toBeInTheDocument();
      });
    });
  });

  it("names its effect and reports Cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn<() => void>();
    const onConfirm = vi.fn<() => void>();
    render(
      <ConfirmDialog
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Unsubscribe from xkcd?"
        confirmLabel="Unsubscribe"
      >
        Its articles leave every stream.
      </ConfirmDialog>,
    );

    await user.click(ui.button("Unsubscribe"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(ui.button("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("refuses Cancel, Escape and a backdrop click while busy", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn<() => void>();
    render(
      <ConfirmDialog
        open
        busy
        onCancel={onCancel}
        onConfirm={() => {}}
        title="Unsubscribe from xkcd?"
        confirmLabel="Unsubscribe"
        confirmDisabled
      >
        Its articles leave every stream.
      </ConfirmDialog>,
    );
    const dialog = ui.dialog;

    expect(ui.button("Cancel")).toBeDisabled();
    // jsdom has no close requests: Escape reaches the dialog as a keydown and a "cancel" event.
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(fireEvent(dialog, new Event("cancel", { cancelable: true }))).toBe(false);
    await user.pointer({
      keys: "[MouseLeft]",
      target: dialog,
      coords: { clientX: 10, clientY: 10 },
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("open");
  });

  describe("when busy", () => {
    it("refuses Escape with the focus on body", () => {
      render(
        <ConfirmDialog
          open
          busy
          onCancel={() => {}}
          onConfirm={() => {}}
          title="Unsubscribe from xkcd?"
          confirmLabel="Unsubscribe"
          confirmDisabled
        >
          Its articles leave every stream.
        </ConfirmDialog>,
      );
      document.body.focus();

      expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false);
      expect(ui.dialog).toHaveAttribute("open");
    });
  });

  describe("when the click lands on the backdrop", () => {
    const renderDialog = () => {
      const onCancel = vi.fn<() => void>();
      render(
        <ConfirmDialog
          open
          onCancel={onCancel}
          onConfirm={() => {}}
          title="Unsubscribe from xkcd?"
          confirmLabel="Unsubscribe"
        >
          Its articles leave every stream.
        </ConfirmDialog>,
      );
      // jsdom lays nothing out: the dialog's box is 0×0 at the origin, so (10, 10) is backdrop.
      return { onCancel, dialog: ui.dialog, backdrop: { x: 10, y: 10 } };
    };

    it("cancels on a click on the backdrop", async () => {
      const user = userEvent.setup();
      const { onCancel, dialog, backdrop } = renderDialog();

      await user.pointer({
        keys: "[MouseLeft]",
        target: dialog,
        coords: { clientX: backdrop.x, clientY: backdrop.y },
      });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("stays open under a click inside it or a drag that ends on the backdrop", async () => {
      const user = userEvent.setup();
      const { onCancel, dialog, backdrop } = renderDialog();

      await user.click(ui.text("Its articles leave every stream."));
      await user.pointer([
        { keys: "[MouseLeft>]", target: ui.text("Its articles leave every stream.") },
        { target: dialog, coords: { clientX: backdrop.x, clientY: backdrop.y } },
        { keys: "[/MouseLeft]" },
      ]);
      // A press on the dialog's own padding lands inside its box.
      await user.pointer({
        keys: "[MouseLeft]",
        target: dialog,
        coords: { clientX: 0, clientY: 0 },
      });
      expect(onCancel).not.toHaveBeenCalled();
      expect(dialog).toHaveAttribute("open");
    });
  });
});
