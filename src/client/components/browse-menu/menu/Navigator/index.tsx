import type { RefObject } from "react";
import type { NavigatorPanelHandle } from "client/components/browse-menu/menu/NavigatorPanel";
import { NavigatorPanel } from "client/components/browse-menu/menu/NavigatorPanel";
import { useReparentedContent } from "client/hooks/useReparentedContent";
import { useTier } from "client/hooks/useTier";
import type { LocationModel } from "client/components/header/location/locationModel";
import { DesktopPopover } from "./DesktopPopover";
import { PhoneSheet } from "./PhoneSheet";

export type { NavigatorPanelHandle };

interface NavigatorProps {
  open: boolean;
  onClose: () => void;
  // Escape and row activation hand focus back to the location bar's field; a click outside or a
  // focus-out must not move focus at all.
  onRequestFocus: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  panelHandleRef: RefObject<NavigatorPanelHandle | null>;
  // The stream the route points at, with its label, whether it is narrower than every article,
  // the search text, and a way to widen both the view and the next search back out.
  location: LocationModel;
}

// Below `sm`, the location bar opens this as a full-height bottom sheet with its own search
// field. From `sm` up, the bar is the field itself (see LocationBar) and this is only the
// anchored results popover underneath it — same `NavigatorPanel` body either way.
export const Navigator = ({
  open,
  onClose,
  onRequestFocus,
  anchorRef,
  panelHandleRef,
  location,
}: NavigatorProps) => {
  const phone = useTier() === "phone";
  const { draft, onDraftChange, scopeKey, scopeLabel } = location;
  const { portal, slot } = useReparentedContent(
    open ? (
      <NavigatorPanel
        ref={panelHandleRef}
        query={draft}
        onQueryChange={onDraftChange}
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
          panelHandleRef={panelHandleRef}
          location={location}
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
