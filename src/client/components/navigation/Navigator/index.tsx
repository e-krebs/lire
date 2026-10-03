import type { RefObject } from "react";
import type { NavigatorPanelHandle } from "client/components/navigation/NavigatorPanel";
import { NavigatorPanel } from "client/components/navigation/NavigatorPanel";
import { useReparentedContent } from "client/hooks/useReparentedContent";
import { useTier } from "client/hooks/useTier";
import { DesktopPopover } from "./DesktopPopover";
import { PhoneSheet } from "./PhoneSheet";

export type { NavigatorPanelHandle };

interface NavigatorProps {
  open: boolean;
  onClose: () => void;
  // Escape and row activation hand focus back to the location bar's field; a click outside or a
  // focus-out must not move focus at all.
  onRequestFocus: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  anchorRef: RefObject<HTMLElement | null>;
  panelHandleRef: RefObject<NavigatorPanelHandle | null>;
  // The stream the route points at, as its route key, with its label, whether it is narrower
  // than every article, and a way to widen both the view and the next search back out.
  clearable: boolean;
  scopeKey: string;
  scopeLabel: string;
  onClearScope: () => void;
  onClearText: () => void;
}

// Below `sm`, the location bar opens this as a full-height bottom sheet with its own search
// field. From `sm` up, the bar is the field itself (see LocationBar) and this is only the
// anchored results popover underneath it — same `NavigatorPanel` body either way.
export const Navigator = ({
  open,
  onClose,
  onRequestFocus,
  query,
  onQueryChange,
  anchorRef,
  panelHandleRef,
  clearable,
  scopeKey,
  scopeLabel,
  onClearScope,
  onClearText,
}: NavigatorProps) => {
  const phone = useTier() === "phone";
  const { portal, slot } = useReparentedContent(
    open ? (
      <NavigatorPanel
        ref={panelHandleRef}
        query={query}
        onQueryChange={onQueryChange}
        onClose={
          phone
            ? onClose
            : () => {
                onClose();
                onRequestFocus();
              }
        }
        scopeKey={scopeKey}
        scopeLabel={scopeLabel}
      />
    ) : null,
  );

  return (
    <>
      {phone ? (
        <PhoneSheet
          open={open}
          onClose={onClose}
          query={query}
          onQueryChange={onQueryChange}
          panelHandleRef={panelHandleRef}
          clearable={clearable}
          scopeLabel={scopeLabel}
          onClearScope={onClearScope}
          onClearText={onClearText}
        >
          {slot}
        </PhoneSheet>
      ) : (
        <DesktopPopover
          open={open}
          onClose={onClose}
          onRequestFocus={onRequestFocus}
          anchorRef={anchorRef}
        >
          {slot}
        </DesktopPopover>
      )}
      {portal}
    </>
  );
};
