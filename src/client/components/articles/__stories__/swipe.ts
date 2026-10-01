import { fireEvent } from "storybook/test";

// Chromium honours setPointerCapture only for real pointers, so the synthetic ones get a no-op.
export const swipe = async ({
  target,
  dx,
  lift = true,
}: {
  target: Element;
  dx: number;
  lift?: boolean;
}): Promise<void> => {
  Object.defineProperty(target, "setPointerCapture", { value: () => {}, configurable: true });
  const start = { clientX: 150, clientY: 100, pointerId: 1, pointerType: "touch" };
  await fireEvent.pointerDown(target, start);
  for (const step of [0.25, 0.5, 1]) {
    await fireEvent.pointerMove(target, { ...start, clientX: start.clientX + dx * step });
  }
  if (lift) await fireEvent.pointerUp(target, { ...start, clientX: start.clientX + dx });
};
