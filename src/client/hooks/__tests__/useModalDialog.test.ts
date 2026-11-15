import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useModalDialog } from "../useModalDialog";

const makeDialog = ({ modal }: { modal: boolean }) => {
  const dialog = document.createElement("dialog");
  const showModal = vi.fn<() => void>();
  const dialogClose = vi.fn<() => void>();
  if (modal) {
    dialog.showModal = showModal;
    dialog.close = dialogClose;
  } else {
    Object.defineProperty(dialog, "showModal", { value: undefined });
  }
  return { dialog, showModal, dialogClose };
};

const setup = ({
  modal,
  shouldNotify,
  onFallbackClose,
  onClose = vi.fn<() => void>(),
}: {
  modal: boolean;
  shouldNotify?: () => boolean;
  onFallbackClose?: () => void;
  onClose?: () => void;
}) => {
  const { dialog, showModal, dialogClose } = makeDialog({ modal });
  const dialogRef = { current: dialog };
  const { result, rerender } = renderHook(
    (props: { onClose: () => void }) =>
      useModalDialog({ dialogRef, onClose: props.onClose, shouldNotify, onFallbackClose }),
    { initialProps: { onClose } },
  );
  return { dialog, showModal, dialogClose, onClose, result, rerender };
};

describe("useModalDialog", () => {
  describe("when a native dialog", () => {
    it("show calls showModal", () => {
      const { dialog, showModal, result } = setup({ modal: true });
      result.current.show(dialog);
      expect(showModal).toHaveBeenCalledTimes(1);
    });

    it("close calls dialog.close and waits for the close event", () => {
      const { dialog, dialogClose, onClose, result } = setup({ modal: true });
      result.current.close(dialog);
      expect(dialogClose).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("the close event calls onClose", () => {
      const { dialog, onClose } = setup({ modal: true });
      dialog.dispatchEvent(new Event("close"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("skips onClose on the close event when shouldNotify is false", () => {
      const { dialog, onClose } = setup({ modal: true, shouldNotify: () => false });
      dialog.dispatchEvent(new Event("close"));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("consumes a shouldNotify flag once for a close event delivered after close returns", () => {
      let suppress = true;
      const shouldNotify = vi.fn<() => boolean>(() => {
        const notify = !suppress;
        suppress = false;
        return notify;
      });
      const { dialog, onClose, result } = setup({ modal: true, shouldNotify });
      result.current.close(dialog);
      expect(shouldNotify).not.toHaveBeenCalled();
      dialog.dispatchEvent(new Event("close"));
      expect(shouldNotify).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("consumes a shouldNotify flag once across a prop-driven close and an immediate reopen", () => {
      let suppress = true;
      const shouldNotify = vi.fn<() => boolean>(() => {
        const notify = !suppress;
        suppress = false;
        return notify;
      });
      const { dialog, onClose, result } = setup({ modal: true, shouldNotify });
      result.current.close(dialog);
      result.current.show(dialog);
      dialog.dispatchEvent(new Event("close"));
      expect(shouldNotify).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      suppress = false;
      dialog.dispatchEvent(new Event("close"));
      expect(shouldNotify).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("when showModal is missing (jsdom)", () => {
    it("show sets the open attribute", () => {
      const { dialog, result } = setup({ modal: false });
      result.current.show(dialog);
      expect(dialog.hasAttribute("open")).toBe(true);
    });

    it("close removes the open attribute and calls onClose", () => {
      const { dialog, onClose, result } = setup({ modal: false });
      result.current.show(dialog);
      result.current.close(dialog);
      expect(dialog.hasAttribute("open")).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("skips onClose when shouldNotify is false", () => {
      const onFallbackClose = vi.fn<() => void>();
      const { dialog, onClose, result } = setup({
        modal: false,
        shouldNotify: () => false,
        onFallbackClose,
      });
      result.current.close(dialog);
      expect(onFallbackClose).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("runs onFallbackClose before onClose", () => {
      const order: string[] = [];
      const { dialog, result } = setup({
        modal: false,
        onClose: () => order.push("close"),
        onFallbackClose: () => order.push("fallback"),
      });
      result.current.close(dialog);
      expect(order).toEqual(["fallback", "close"]);
    });

    it("consumes a shouldNotify flag once per close", () => {
      let suppress = true;
      const shouldNotify = vi.fn<() => boolean>(() => {
        const notify = !suppress;
        suppress = false;
        return notify;
      });
      const { dialog, onClose, result } = setup({ modal: false, shouldNotify });
      result.current.show(dialog);
      result.current.close(dialog);
      expect(shouldNotify).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("keeps show and close identity when onClose changes", () => {
    const { result, rerender } = setup({ modal: true });
    const { show, close } = result.current;
    const nextOnClose = vi.fn<() => void>();
    rerender({ onClose: nextOnClose });
    expect(result.current.show).toBe(show);
    expect(result.current.close).toBe(close);
    result.current.close(makeDialog({ modal: false }).dialog);
    expect(nextOnClose).toHaveBeenCalledTimes(1);
  });
});
