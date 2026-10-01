import type { ReactNode, RefObject } from "react";

export interface SidePanelProps {
  /** Panel is shown. */
  open: boolean;
  /** Panel dismissed. */
  onClose: () => void;
  /** Panel heading. */
  title: string;
  /** Line under the title. */
  subtitle?: ReactNode;
  /** Sits before the title, e.g. the feed's hue dot. */
  leading?: ReactNode;
  /** Panel body. */
  children: ReactNode;
  /** Footer controls. */
  actions?: ReactNode;
}

// What SidePanel hands the tier wrapper around the shared `PanelBody`, shown through `children`.
export interface PanelShellProps {
  open: boolean;
  onClose: () => void;
  headingId: string;
  focusHeading: () => void;
  // Set by the wrapper to how its own close button closes it.
  closeRef: RefObject<() => void>;
  children: ReactNode;
}
