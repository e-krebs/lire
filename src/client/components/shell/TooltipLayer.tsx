import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { displayShortcut, shortcutList, sideOf } from "client/utils/tooltip";
import type { TooltipSide } from "client/utils/tooltip";

const SHOW_DELAY_MS = 400;
// A tooltip opened this soon after the last one closed skips the delay: hopping along a toolbar.
const WARM_MS = 300;
// Matches the exit transition in styles.css.
const EXIT_MS = 150;
const ANCHOR_NAME = "--tip";
// The beak stays clear of the pill's rounded corners: radius plus half the beak.
const BEAK_MARGIN = 14;

interface ActiveTip {
  trigger: HTMLElement;
  label: string;
  shortcut?: string;
  side: TooltipSide;
}

interface Placement {
  side: TooltipSide;
  // Distance along the pill's edge from its start to the trigger's centre.
  beak: number;
}

const triggerOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;

const isTruncated = (element: HTMLElement): boolean =>
  element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;

// `data-tip-overflow` makes the tooltip conditional on truncation: empty, the tooltip only shows
// once the text is cut; with a value, that value is what shows while the text still fits.
const labelOf = (trigger: HTMLElement): string | undefined => {
  const { tip = "", tipOverflow } = trigger.dataset;
  if (tipOverflow === undefined || isTruncated(trigger)) return tip;
  return tipOverflow === "" ? undefined : tipOverflow;
};

const isTypingTarget = (element: HTMLElement): boolean =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  element.isContentEditable;

const focusVisible = (element: HTMLElement): boolean => {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
};

const clamp = ({ value, min, max }: { value: number; min: number; max: number }): number =>
  Math.min(Math.max(value, min), max);

// Where the browser put the box once `position-try-fallbacks` had its say, and where along the
// facing edge the trigger's centre is: `anchor-center` shifts the box inwards at a viewport edge,
// so the beak cannot assume the middle.
const measure = ({ box, anchor }: { box: DOMRect; anchor: DOMRect }): Placement => {
  let side: TooltipSide;
  if (box.bottom <= anchor.top + 1) side = "top";
  else if (box.top >= anchor.bottom - 1) side = "bottom";
  else side = box.right <= anchor.left + 1 ? "left" : "right";
  const vertical = side === "top" || side === "bottom";
  const centre = vertical
    ? anchor.left + anchor.width / 2 - box.left
    : anchor.top + anchor.height / 2 - box.top;
  const extent = vertical ? box.width : box.height;
  return {
    side,
    beak: clamp({
      value: centre,
      min: BEAK_MARGIN,
      max: Math.max(BEAK_MARGIN, extent - BEAK_MARGIN),
    }),
  };
};

const popoverSupported = typeof HTMLElement.prototype.showPopover === "function";

// Chromium throws when a popover call lands inside another popover's hide steps, as when Escape
// closes the account menu and hands focus back to its tooltip trigger.
const ignoreInvalidState = (call: () => void): void => {
  try {
    call();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
  }
};

// One tooltip for the whole app, in the top layer, anchored by CSS to whichever trigger holds
// `anchor-name: --tip`. Triggers are plain `data-tip` attributes anywhere in the tree, so the
// layer listens at the document: hover after a delay, keyboard focus at once, never on touch.
export const TooltipLayer = () => {
  const ref = useRef<HTMLDivElement>(null);
  const anchoredRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<ActiveTip | null>(null);
  const [placement, setPlacement] = useState<Placement>();

  useEffect(() => {
    let current: HTMLElement | null = null;
    let pending: HTMLElement | null = null;
    let timer = 0;
    let lastClose = Number.NEGATIVE_INFINITY;
    let anchorTop = 0;

    const cancel = (): void => {
      window.clearTimeout(timer);
      pending = null;
    };
    const open = ({ trigger, label }: { trigger: HTMLElement; label: string }): void => {
      pending = null;
      current = trigger;
      anchorTop = trigger.getBoundingClientRect().top;
      setActive({
        trigger,
        label,
        shortcut: trigger.getAttribute("aria-keyshortcuts") ?? undefined,
        side: sideOf(trigger.dataset.tipSide),
      });
    };
    const close = (): void => {
      cancel();
      if (!current) return;
      current = null;
      lastClose = performance.now();
      setActive(null);
    };
    const schedule = ({ trigger, instant }: { trigger: HTMLElement; instant: boolean }): void => {
      if (current === trigger || pending === trigger) return;
      cancel();
      const label = labelOf(trigger);
      if (label === undefined) return;
      if (instant || performance.now() - lastClose < WARM_MS) {
        open({ trigger, label });
        return;
      }
      pending = trigger;
      timer = window.setTimeout(() => {
        open({ trigger, label });
      }, SHOW_DELAY_MS);
    };

    const onPointerOver = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      const trigger = triggerOf(event.target);
      if (trigger) schedule({ trigger, instant: false });
    };
    const onPointerOut = (event: PointerEvent): void => {
      const trigger = triggerOf(event.target);
      if (!trigger) return;
      if (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
      if (current === trigger) close();
      else if (pending === trigger) cancel();
    };
    // A field gains focus to be typed into, so it only gets the hover tooltip.
    const onFocusIn = (event: FocusEvent): void => {
      const trigger = triggerOf(event.target);
      if (trigger && !isTypingTarget(trigger) && focusVisible(trigger))
        schedule({ trigger, instant: true });
    };
    const onFocusOut = (event: FocusEvent): void => {
      const trigger = triggerOf(event.target);
      if (trigger && (current === trigger || pending === trigger)) close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" || (current && isTypingTarget(current))) close();
    };
    // Opening a popover makes Chromium fire one scroll event with nothing scrolled, so a bare
    // `scroll → close` would shut the tooltip the frame it opens: close once the anchor moved.
    const onScroll = (): void => {
      if (!current) return;
      if (!current.isConnected || Math.abs(current.getBoundingClientRect().top - anchorTop) > 2) {
        close();
      }
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      cancel();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  // The active trigger is the anchor. On close the anchor stays through the exit fade: unanchored,
  // the fading box would jump to the viewport's corner. A new trigger takes over at once.
  useEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const previous = anchoredRef.current;
    if (active) {
      const { trigger } = active;
      if (previous && previous !== trigger) previous.style.removeProperty("anchor-name");
      trigger.style.setProperty("anchor-name", ANCHOR_NAME);
      anchoredRef.current = trigger;
      // Shown a frame late, so a focus change inside another popover's hide steps cannot nest it.
      const frame = requestAnimationFrame(() => {
        if (popoverSupported && box.isConnected && !box.matches(":popover-open")) {
          ignoreInvalidState(() => {
            box.showPopover();
          });
        }
        setPlacement(
          measure({ box: box.getBoundingClientRect(), anchor: trigger.getBoundingClientRect() }),
        );
      });
      return () => {
        cancelAnimationFrame(frame);
        setPlacement(undefined);
      };
    }
    if (popoverSupported && box.isConnected && box.matches(":popover-open")) {
      ignoreInvalidState(() => {
        box.hidePopover();
      });
    }
    const timer = window.setTimeout(() => {
      if (anchoredRef.current === previous) {
        previous?.style.removeProperty("anchor-name");
        anchoredRef.current = null;
      }
    }, EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [active]);

  // A CSS property, not a class: the plugin reads any variable named `style` as a class list.
  const style: CSSProperties & { "--tooltip-beak"?: string } =
    // oxlint-disable-next-line tailwindcss/no-unknown-classes
    placement === undefined ? {} : { "--tooltip-beak": `${placement.beak}px` };

  return (
    <div
      ref={ref}
      role="tooltip"
      popover={popoverSupported ? "manual" : undefined}
      data-open={active ? "" : undefined}
      data-side={active?.side}
      data-placed={active ? (placement?.side ?? active.side) : undefined}
      style={style}
      className="tooltip"
    >
      {active ? (
        <>
          <span>{active.label}</span>
          {active.shortcut === undefined
            ? null
            : shortcutList(active.shortcut).map((shortcut) => (
                <kbd key={shortcut}>{displayShortcut(shortcut)}</kbd>
              ))}
        </>
      ) : null}
    </div>
  );
};
