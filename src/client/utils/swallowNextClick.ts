// A press outside a menu dismisses it, and the click that follows the press must not land on
// whatever the menu was covering. Armed from the dismissing `pointerdown`, it eats that one click
// in the capture phase; a press that never clicks (a drag, a cancel) is disarmed by the next press.
export const swallowNextClick = (): void => {
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    disarm();
  };
  const disarm = (): void => {
    document.removeEventListener("click", swallow, { capture: true });
    document.removeEventListener("pointerdown", disarm, { capture: true });
  };
  document.addEventListener("click", swallow, { capture: true });
  // Queued so the press that armed it does not disarm it.
  window.setTimeout(() => {
    document.addEventListener("pointerdown", disarm, { capture: true });
  }, 0);
};
