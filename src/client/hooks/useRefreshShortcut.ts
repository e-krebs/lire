import { useEffect } from "react";
import { isTypingTarget } from "client/utils/isTypingTarget";

// Only inside the results: the top bar, the Navigator and the account menu all live in `<header>`,
// and `R` must stay quiet while one of them holds focus.
const inMainContent = (target: EventTarget | null): boolean =>
  target === document.body || (target instanceof Element && target.closest("main") !== null);

// Lowercase `r` only, so Shift+R stays free.
export const useRefreshShortcut = ({
  enabled,
  onRefresh,
}: {
  enabled: boolean;
  onRefresh: () => void;
}): void => {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "r" ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        !inMainContent(event.target)
      )
        return;
      event.preventDefault();
      onRefresh();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, onRefresh]);
};
