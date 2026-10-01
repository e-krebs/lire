import { createContext } from "react";

// Set by the panel's owner while the panel plays its exit: call it once the exit ends, so the owner
// can unmount the panel. Null while the panel is up.
export const PanelExitContext = createContext<(() => void) | null>(null);
