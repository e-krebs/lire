import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "shared/feedsApi/types";
import { ReaderHeader } from "../ReaderHeader";

const ENTRY: Entry = {
  id: "entry-1",
  fingerprint: "f1",
  title: "A long read",
  crawled: Date.UTC(2026, 8, 1),
  unread: true,
  origin: { streamId: "feed/http://example-news.test/rss", title: "Example News" },
  alternate: [{ href: "https://example-news.test/a-long-read", type: "text/html" }],
};

type Report = (records: Array<{ intersectionRatio: number; isIntersecting: boolean }>) => void;

const ui = {
  get untitledHeading() {
    return screen.getByRole("heading", { name: "(untitled)" });
  },
  get queryLink() {
    return screen.queryByRole("link");
  },
};

const stubIntersectionObserver = () => {
  const observer = { report: undefined as Report | undefined, disconnect: vi.fn<() => void>() };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: Report) {
        observer.report = callback;
      }
      observe(): void {}
      disconnect(): void {
        observer.disconnect();
      }
    },
  );
  return observer;
};

const setup = ({ entry = ENTRY }: { entry?: Entry } = {}) => {
  const paneRef = createRef<HTMLDivElement>();
  const onKeep = vi.fn<() => void>();
  const onMark = vi.fn<() => void>();
  const Pane = () => (
    <div ref={paneRef}>
      <ReaderHeader
        entry={entry}
        minutes={0}
        openedUnread={true}
        paneRef={paneRef}
        onKeep={onKeep}
        onMark={onMark}
      />
    </div>
  );
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <Pane />
    </QueryClientProvider>,
  );
  const head = () => view.container.querySelector(".reader-head");
  return { view, head };
};

describe("ReaderHeader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("condenses once the sentinel scrolls out and expands only back at the very top", () => {
    const observer = stubIntersectionObserver();
    const { head } = setup();
    const report = (record: { intersectionRatio: number; isIntersecting: boolean }): void => {
      act(() => {
        observer.report?.([record]);
      });
    };
    expect(head()).not.toHaveAttribute("data-condensed");

    report({ intersectionRatio: 0, isIntersecting: false });
    expect(head()).toHaveAttribute("data-condensed");

    // Partly back in view is the band in between: the state holds.
    report({ intersectionRatio: 0.5, isIntersecting: true });
    expect(head()).toHaveAttribute("data-condensed");

    act(() => {
      observer.report?.([]);
    });
    expect(head()).toHaveAttribute("data-condensed");

    report({ intersectionRatio: 1, isIntersecting: true });
    expect(head()).not.toHaveAttribute("data-condensed");
  });

  it("stops observing on unmount", () => {
    const observer = stubIntersectionObserver();
    const { view } = setup();

    view.unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it("shows a plain title without an original to link to", () => {
    setup({ entry: { ...ENTRY, alternate: undefined, title: undefined } });

    expect(ui.untitledHeading).toBeInTheDocument();
    expect(ui.queryLink).toBeNull();
  });
});
