import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WriteFailureToast } from "client/components/app/notices/WriteFailureToast";
import { dismissWriteFailure, reportWriteFailure } from "client/utils/writeFailure";

const MESSAGE = "Your change did not save and was undone.";

const ui = {
  get status() {
    return screen.getByRole("status");
  },
  get dismiss() {
    return screen.getByRole("button", { name: "Dismiss" });
  },
};

const report = (): void => {
  act(() => {
    reportWriteFailure();
  });
};

const elapse = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("WriteFailureToast", () => {
  afterEach(() => {
    vi.useRealTimers();
    dismissWriteFailure();
  });

  it("stays empty at rest", () => {
    render(<WriteFailureToast />);

    expect(ui.status).toBeEmptyDOMElement();
  });

  it("shows the message after a report", () => {
    render(<WriteFailureToast />);

    report();

    expect(ui.status).toHaveTextContent(MESSAGE);
  });

  it("hides when Dismiss is clicked", async () => {
    render(<WriteFailureToast />);
    report();

    await userEvent.click(ui.dismiss);

    expect(ui.status).toBeEmptyDOMElement();
  });

  it("hides six seconds after a report", () => {
    vi.useFakeTimers();
    render(<WriteFailureToast />);
    report();

    elapse(5_999);
    expect(ui.status).toHaveTextContent(MESSAGE);

    elapse(1);
    expect(ui.status).toBeEmptyDOMElement();
  });

  it("restarts the six-second timer on a second report", () => {
    vi.useFakeTimers();
    render(<WriteFailureToast />);
    report();
    elapse(4_000);

    report();
    elapse(4_000);
    expect(ui.status).toHaveTextContent(MESSAGE);

    elapse(2_000);
    expect(ui.status).toBeEmptyDOMElement();
  });
});
