import { afterEach, describe, expect, it, vi } from "vitest";
import { swallowNextClick } from "../swallowNextClick";

const click = (target: Element): MouseEvent => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("swallowNextClick", () => {
  // Elements are appended straight to document.body, which the global cleanup does not unmount.
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("eats the one click that follows the arming press, and no other", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const onClick = vi.fn<() => void>();
    button.addEventListener("click", onClick);

    swallowNextClick();
    expect(click(button).defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();

    expect(click(button).defaultPrevented).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disarmed by a later press that never clicked", () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    document.body.append(button);
    const onClick = vi.fn<() => void>();
    button.addEventListener("click", onClick);

    swallowNextClick();
    vi.runAllTimers();
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(click(button).defaultPrevented).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
