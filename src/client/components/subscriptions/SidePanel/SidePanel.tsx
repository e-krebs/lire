import type { KeyboardEvent } from "react";
import { useCallback, useId, useRef } from "react";
import { useReparentedContent } from "client/hooks/useReparentedContent";
import { useTier } from "client/hooks/useTier";
import { BottomSheet } from "./BottomSheet";
import { FloatingPanel } from "./FloatingPanel";
import { PanelBody } from "./PanelBody";
import type { SidePanelProps } from "./shared";

// The body is rendered once, here, and shown inside whichever wrapper the tier picks, so a tier
// switch keeps its state.
export const SidePanel = ({ open, ...props }: SidePanelProps) => {
  const { onClose } = props;
  const phone = useTier() === "phone";
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  const focusHeading = useCallback(() => {
    headingRef.current?.focus();
  }, []);
  const close = useCallback(() => {
    closeRef.current();
  }, []);
  // On the body, not the floating aside: a portal's events bubble through the React tree.
  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };
  const { portal, slot } = useReparentedContent(
    open ? (
      <PanelBody
        {...props}
        onClose={close}
        headingId={headingId}
        headingRef={headingRef}
        onKeyDown={phone ? undefined : closeOnEscape}
      />
    ) : null,
  );
  const shell = { open, onClose, headingId, focusHeading, closeRef, children: slot };

  return (
    <>
      {phone ? <BottomSheet {...shell} /> : <FloatingPanel {...shell} />}
      {portal}
    </>
  );
};
