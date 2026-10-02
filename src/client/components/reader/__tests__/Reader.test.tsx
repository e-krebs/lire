import { fireEvent, render, waitFor } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { EntrySchema } from "shared/feedsApi/types";
import { fixtureTransport, resetFixtureState } from "client/api/adapters/fixture";
import { Reader } from "../Reader";

// Seed entries the panel's two origin states hang off: `news-0029` is unread with an original,
// `design-0030` is already read, `letter-0003` is a newsletter with no `alternate`.
const UNREAD_ID = "news-0029";
const READ_ID = "design-0030";
const NEWSLETTER_ID = "letter-0003";
const TITLE = "Chipmaker unveils next generation of low-power silicon";
const NEWSLETTER_TITLE = "Weekly Letter #3: what shipped, what slipped";

const ui = {
  async text(view: RenderResult, content: string) {
    return view.findByText(content);
  },
  async link(view: RenderResult, name: string) {
    return view.findByRole("link", { name });
  },
  queryLink(view: RenderResult, name: string) {
    return view.queryByRole("link", { name });
  },
  links(view: RenderResult) {
    return view.queryAllByRole("link");
  },
  async heading(view: RenderResult, options: { name?: string; level?: number }) {
    return view.findByRole("heading", options);
  },
  async button(view: RenderResult, name: string) {
    return view.findByRole("button", { name });
  },
  bodyImages(view: RenderResult) {
    return [...view.container.querySelectorAll("article img")];
  },
  frame(view: RenderResult) {
    return view.container.querySelector("iframe");
  },
  frameDocument(view: RenderResult) {
    return new DOMParser().parseFromString(
      ui.frame(view)?.getAttribute("srcdoc") ?? "",
      "text/html",
    );
  },
};

// The read state as the adapter holds it, which is what the mutation actually changes.
const fixtureUnread = async (entryId: string): Promise<boolean> => {
  const response = await fixtureTransport({ method: "GET", path: `/v3/entries/${entryId}` });
  const [entry] = EntrySchema.array().parse(await response.json());
  return entry.unread;
};

// The panel lives on its own path: leaving it is a navigation to the stream route, so the stream
// page showing up is the assertion that the exit worked.
const setup = ({ entryId }: { entryId: string }) => {
  vi.stubEnv("VITE_API_MODE", "mock");
  resetFixtureState();

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stream/$streamKey",
    validateSearch: (search: Record<string, unknown>): { unread?: boolean } => ({
      unread: typeof search.unread === "boolean" ? search.unread : undefined,
    }),
    component: () => <p>stream page</p>,
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reader",
    component: () => <Reader entryId={entryId} streamKey="all" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute, readerRoute]),
    history: createMemoryHistory({ initialEntries: ["/reader"] }),
  });

  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, view };
};

// A hero image outside the article, not counting one the sanitized body already repeats.
const hero = (view: RenderResult) =>
  [...view.container.querySelectorAll("img")].filter((img) => !img.closest("article"));

describe("Reader", () => {
  it("renders the masthead, the title link and the author", async () => {
    const { view } = setup({ entryId: UNREAD_ID });

    expect(await ui.text(view, "Example News")).toBeInTheDocument();
    const title = await ui.link(view, TITLE);
    expect(title).toHaveAttribute("href", "http://example-news.test/articles/29");
    expect(title).toHaveAttribute("target", "_blank");
    expect(title).toHaveAttribute("rel", "noopener");
    expect(await ui.text(view, "Example News staff")).toBeInTheDocument();
  });

  it("names both exits after the unread state the panel opened in", async () => {
    const { view } = setup({ entryId: UNREAD_ID });

    expect(await ui.button(view, "Keep unread")).toBeInTheDocument();
    expect(await ui.button(view, "Mark as read")).toBeInTheDocument();
    expect(await ui.text(view, "Mark as read and close")).toBeInTheDocument();
  });

  it("names both exits after the read state the panel opened in", async () => {
    const { view } = setup({ entryId: READ_ID });

    expect(await ui.button(view, "Keep read")).toBeInTheDocument();
    expect(await ui.button(view, "Mark as unread")).toBeInTheDocument();
    expect(await ui.text(view, "Mark as unread and close")).toBeInTheDocument();
  });

  it("shows the hero once: above the body, or not at all when the body repeats it", async () => {
    const repeated = setup({ entryId: NEWSLETTER_ID });
    await ui.heading(repeated.view, { name: NEWSLETTER_TITLE });
    expect(hero(repeated.view)).toHaveLength(0);
    expect(ui.frameDocument(repeated.view).images).toHaveLength(1);
    repeated.view.unmount();

    const distinct = setup({ entryId: UNREAD_ID });
    await ui.link(distinct.view, TITLE);
    expect(hero(distinct.view)).toHaveLength(1);
  });

  it("retries the hero on the proxy copy, then drops it", async () => {
    const { view } = setup({ entryId: UNREAD_ID });
    await ui.link(view, TITLE);

    const [first] = hero(view);
    expect(first).toHaveAttribute("src", "https://picsum.photos/seed/news-0029/700/1000");
    fireEvent.error(first);
    await waitFor(() => {
      expect(hero(view)[0]).toHaveAttribute(
        "src",
        "https://picsum.photos/seed/news-0029-proxy/700/1000",
      );
    });
    fireEvent.error(hero(view)[0]);
    await waitFor(() => {
      expect(hero(view)).toHaveLength(0);
    });
  });

  it("swaps a failed body image for a labelled placeholder", async () => {
    const { view } = setup({ entryId: UNREAD_ID });
    await ui.link(view, TITLE);

    const img = ui.bodyImages(view)[0];
    const alt = img.getAttribute("alt") ?? "";
    fireEvent.error(img);

    expect(img).not.toBeInTheDocument();
    const label = alt === "" ? "Image unavailable" : `Image unavailable: ${alt}`;
    expect(
      view.container.querySelector(`article [role=img][aria-label="${label}"]`),
    ).not.toBeNull();
  });

  it("renders a newsletter's title as plain text, with no link to an original", async () => {
    const { view } = setup({ entryId: NEWSLETTER_ID });

    const heading = await ui.heading(view, { level: 1 });
    expect(heading).toHaveTextContent(NEWSLETTER_TITLE);
    const links = ui.links(view);
    expect(links.some((link) => link.textContent.includes(NEWSLETTER_TITLE))).toBe(false);
  });

  it("renders a newsletter body in a sandboxed iframe", async () => {
    const { view } = setup({ entryId: NEWSLETTER_ID });
    await ui.heading(view, { level: 1 });

    expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
    expect(ui.frame(view)).toHaveAttribute(
      "sandbox",
      "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    );
    expect(ui.frameDocument(view).body.textContent.trim()).not.toBe("");
    expect(view.container.querySelector(".prose-reader")).toBeNull();
  });

  it("keeps a blog post inline, with no iframe", async () => {
    const { view } = setup({ entryId: UNREAD_ID });
    await ui.link(view, TITLE);

    expect(ui.frame(view)).toBeNull();
    expect(view.container.querySelector("article.prose-reader")).not.toBeNull();
  });

  it("leaves the entry alone when Keep closes the panel", async () => {
    const user = userEvent.setup();
    const { view } = setup({ entryId: UNREAD_ID });

    await user.click(await ui.button(view, "Keep unread"));

    expect(await ui.text(view, "stream page")).toBeInTheDocument();
    expect(await fixtureUnread(UNREAD_ID)).toBe(true);
  });

  it("marks the entry read, then closes the panel, when Mark is used", async () => {
    const user = userEvent.setup();
    const { view } = setup({ entryId: UNREAD_ID });

    await user.click(await ui.button(view, "Mark as read"));

    expect(await ui.text(view, "stream page")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await fixtureUnread(UNREAD_ID)).toBe(false);
    });
  });
});
