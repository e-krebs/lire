// Chrome on Android, with `interactive-widget=resizes-content`, can open a tab or show it again with
// a viewport that runs under the gesture nav bar but reports no bottom safe-area inset: the bottom
// app bar sits half behind the nav bar until the next tab switch. Any change to the viewport meta
// makes Chrome measure again. So after each burst of resizes, and each time the tab shows, the
// widget mode flips off and back on. A flip that fixes the viewport fires one more resize, and the
// flip after it fires none, because on a viewport that is already right Chrome does not resize.
import { isTypingTarget } from "client/utils/isTypingTarget";

// Chrome sends its resizes in bursts about 100 ms long: the flip waits for the burst to end.
const SETTLE_MS = 100;
const WIDGET = "interactive-widget=resizes-content";

const flip = (meta: HTMLMetaElement): void => {
  const content = meta.content;
  meta.content = content.replace(WIDGET, "interactive-widget=resizes-visual");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      meta.content = content;
    });
  });
};

export const installViewportNudge = (): (() => void) => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta?.content.includes(WIDGET)) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    timer = setTimeout(() => {
      // With the keyboard up, the flip would let it cover the field for two frames.
      if (!isTypingTarget(document.activeElement)) flip(meta);
    }, SETTLE_MS);
  };
  schedule();
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("resize", schedule);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("resize", schedule);
  };
};
