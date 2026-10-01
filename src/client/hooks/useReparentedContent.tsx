import { createPortal } from "react-dom";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

// Renders `content` once, at the caller's own position, into a detached host node; the `slot` is
// where that node is shown. A slot rendered under a different parent moves the node instead of
// remounting `content`, so its state survives a wrapper swap. `slot` is null with no content.
export const useReparentedContent = (content: ReactNode) => {
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });
  const adopt = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.appendChild(host);
    },
    [host],
  );
  return {
    portal: createPortal(content, host),
    slot: content == null ? null : <div ref={adopt} style={{ display: "contents" }} />,
  };
};
