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
import { EntrySchema, type Entry } from "shared/feedsApi/types";
import { keys } from "client/api/queries";
import { markReadQueue } from "client/api/markReadQueue";
import { getEntry } from "client/api/client";
import { fixtureTransport, resetFixtureState } from "client/api/adapters/fixture";
import { Reader } from "../Reader";

// Seed entries the panel's two origin states hang off: `101:0dcd64` is unread with an original and
// an image in its body, `101:1298af` is already read, `111:109bd3` is a newsletter with no `url`.
const UNREAD_ID = "101:0dcd64";
const READ_ID = "101:1298af";
const HERO_ID = "101:0f667d";
const NEWSLETTER_ID = "111:109bd3";
const TITLE =
  "A deliberately long article title that goes on well past the usual width of a header to test wrapping and the sticky title";
const NEWSLETTER_TITLE = "Synthetic story 2 from feed 111";

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
  const response = await fixtureTransport({
    method: "GET",
    path: `/api/entries/${encodeURIComponent(entryId)}`,
  });
  return EntrySchema.parse(await response.json()).unread;
};

// The panel lives on its own path: leaving it is a navigation to the stream route, so the stream
// page showing up is the assertion that the exit worked.
const setup = ({ entryId, seedEntry }: { entryId: string; seedEntry?: Entry }) => {
  vi.stubEnv("VITE_API_MODE", "mock");
  resetFixtureState();

  // A seeded entry must not be refetched over by the fixture's own copy.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: seedEntry ? Infinity : 0 } },
  });
  if (seedEntry) client.setQueryData(keys.entry(seedEntry.id), seedEntry);
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

    expect(await ui.text(view, "Example Tech Daily")).toBeInTheDocument();
    const title = await ui.link(view, TITLE);
    expect(title).toHaveAttribute("href", "https://example.test/101/1");
    expect(title).toHaveAttribute("target", "_blank");
    expect(title).toHaveAttribute("rel", "noopener");
    expect(await ui.text(view, "Ada Writer")).toBeInTheDocument();
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
    const entry = await getEntry(UNREAD_ID);
    const repeated = setup({
      entryId: UNREAD_ID,
      seedEntry: { ...entry, imageUrl: "https://images.example.test/long.png" },
    });
    await ui.link(repeated.view, TITLE);
    expect(hero(repeated.view)).toHaveLength(0);
    repeated.view.unmount();

    const distinct = setup({ entryId: HERO_ID });
    await ui.link(distinct.view, "Synthetic story 2 from feed 101");
    expect(hero(distinct.view)).toHaveLength(1);
  });

  it("drops the hero once it fails to load", async () => {
    const { view } = setup({ entryId: HERO_ID });
    await ui.link(view, "Synthetic story 2 from feed 101");

    const [first] = hero(view);
    expect(first).toHaveAttribute("src", "https://images.example.test/101-2.png");
    fireEvent.error(first);
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

  describe("when the body carries an embed", () => {
    const withContent = async ({ entryId, content }: { entryId: string; content: string }) => {
      const entry = await getEntry(entryId);
      return setup({ entryId, seedEntry: { ...entry, content } });
    };
    const postFrames = async (content: string) => {
      const { view } = await withContent({ entryId: UNREAD_ID, content: `<p>Body</p>${content}` });
      const frames = () => [...view.container.querySelectorAll("article.prose-reader iframe")];
      // Embeds wait for the feed list, which says the post is no newsletter.
      await waitFor(() => {
        expect(frames().length).toBeGreaterThan(0);
      });
      return frames();
    };

    it("keeps a YouTube frame, rewritten to youtube.com and sandboxed", async () => {
      const frames = await postFrames(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1" srcdoc="<b>x</b>" onload="alert(1)"></iframe>',
      );

      expect(frames).toHaveLength(1);
      const [frame] = frames;
      expect(frame).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(frame).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
      );
      expect(frame).toHaveAttribute("allow", "encrypted-media; picture-in-picture; fullscreen");
      expect(frame).toHaveAttribute("allowfullscreen");
      expect(frame).toHaveAttribute("loading", "lazy");
      expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      expect(frame).not.toHaveAttribute("srcdoc");
      expect(frame).not.toHaveAttribute("onload");
    });

    it("marks a YouTube frame with data-embed", async () => {
      const [frame] = await postFrames(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      );

      expect(frame).toHaveAttribute("data-embed", "youtube");
    });

    it("accepts the youtube-nocookie and protocol-relative forms", async () => {
      const frames = await postFrames(
        '<iframe src="https://www.youtube-nocookie.com/embed/aaaaaaaaaaa"></iframe>' +
          '<iframe src="//www.youtube.com/embed/bbbbbbbbbbb"></iframe>',
      );

      expect(frames.map((frame) => frame.getAttribute("src"))).toEqual([
        "https://www.youtube.com/embed/aaaaaaaaaaa",
        "https://www.youtube.com/embed/bbbbbbbbbbb",
      ]);
    });

    it("drops frames from other hosts and unsafe schemes", async () => {
      const frames = await postFrames(
        '<iframe src="https://evil.test/video/1"></iframe>' +
          '<iframe src="https://www.instagram.com/p/C0b8bKxLw5Q/embed/"></iframe>' +
          '<iframe src="https://vimeo.com/22439234"></iframe>' +
          '<iframe src="https://platform.twitter.com/embed/Tweet.html?id=1"></iframe>' +
          '<iframe src="javascript:alert(1)"></iframe>' +
          '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>' +
          '<iframe srcdoc="<script>alert(1)</script>"></iframe>' +
          '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      );

      expect(frames.map((frame) => frame.getAttribute("src"))).toEqual([
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ]);
    });

    it("keeps a Vimeo frame, rebuilt with dnt and sandboxed", async () => {
      const frames = await postFrames(
        '<iframe src="https://player.vimeo.com/video/22439234?autoplay=1" srcdoc="<b>x</b>"></iframe>',
      );

      expect(frames).toHaveLength(1);
      const [frame] = frames;
      expect(frame).toHaveAttribute("src", "https://player.vimeo.com/video/22439234?dnt=1");
      expect(frame).toHaveAttribute("data-embed", "vimeo");
      expect(frame).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
      );
      expect(frame).not.toHaveAttribute("srcdoc");
    });

    it("turns a Bluesky blockquote into a Bluesky frame", async () => {
      const frames = await postFrames(
        '<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l"><p>Hello Bluesky</p></blockquote>' +
          '<script async src="https://embed.bsky.app/static/embed.js"></script>',
      );

      expect(frames).toHaveLength(1);
      const [frame] = frames;
      expect(frame).toHaveAttribute(
        "src",
        "https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l",
      );
      expect(frame).toHaveAttribute("data-embed", "bluesky");
      expect(frame).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
      );
    });

    it("turns an X blockquote into an X frame", async () => {
      const frames = await postFrames(
        '<blockquote class="twitter-tweet"><p>Hello from X</p>&mdash; Jack ' +
          '<a href="https://twitter.com/jack/status/1234567890">May 1</a></blockquote>' +
          '<script async src="https://platform.twitter.com/widgets.js"></script>',
      );

      expect(frames).toHaveLength(1);
      const [frame] = frames;
      expect(frame).toHaveAttribute(
        "src",
        "https://platform.twitter.com/embed/Tweet.html?id=1234567890&dnt=true",
      );
      expect(frame).toHaveAttribute("data-embed", "x");
      expect(frame).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
      );
      expect(frame.getAttribute("title")).toContain("Hello from X");
    });

    describe.each([
      {
        brand: "Instagram",
        name: "instagram",
        src: "https://www.instagram.com/p/C0b8bKxLw5Q/embed/",
        quote:
          '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/C0b8bKxLw5Q/">' +
          '<a href="https://www.instagram.com/p/C0b8bKxLw5Q/">A post shared by Ada</a><script>alert(1)</script></blockquote>' +
          '<script async src="//www.instagram.com/embed.js"></script>',
        bad: '<blockquote class="instagram-media" data-instgrm-permalink="https://evil.test/p/C0b8bKxLw5Q/"><a href="https://evil.test/p/C0b8bKxLw5Q/">Bad Instagram</a></blockquote>',
        badText: "Bad Instagram",
      },
      {
        brand: "Threads",
        name: "threads",
        src: "https://www.threads.com/@zuck/post/C8xv0k3PzZ2/embed",
        quote:
          '<blockquote class="text-post-media" data-text-post-permalink="https://www.threads.com/@zuck/post/C8xv0k3PzZ2">' +
          '<a href="https://www.threads.com/@zuck/post/C8xv0k3PzZ2">View on Threads</a><script>alert(1)</script></blockquote>' +
          '<script async src="https://www.threads.com/embed.js"></script>',
        bad: '<blockquote class="text-post-media" data-text-post-permalink="https://evil.test/@zuck/post/C8x/"><a href="https://evil.test/@zuck/post/C8x/">Bad Threads</a></blockquote>',
        badText: "Bad Threads",
      },
      {
        brand: "TikTok",
        name: "tiktok",
        src: "https://www.tiktok.com/embed/v2/6718335390845095173",
        quote:
          '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@scout2015/video/6718335390845095173" data-video-id="6718335390845095173">' +
          '<section><a href="https://www.tiktok.com/@scout2015?refer=embed">@scout2015</a></section><script>alert(1)</script></blockquote>' +
          '<script async src="https://www.tiktok.com/embed.js"></script>',
        bad: '<blockquote class="tiktok-embed" cite="https://evil.test/@a/video/12"><a href="https://evil.test/@a/video/12">Bad TikTok</a></blockquote>',
        badText: "Bad TikTok",
      },
      {
        brand: "Facebook",
        name: "facebook",
        src: "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fzuck%2Fposts%2F10112345678901234",
        quote:
          '<div class="fb-post" data-href="https://www.facebook.com/zuck/posts/10112345678901234"><a href="https://www.facebook.com/zuck/posts/10112345678901234">View post</a></div>' +
          '<script async src="https://connect.facebook.net/en_US/sdk.js"></script>',
        bad: '<div class="fb-post" data-href="https://evil.test/zuck/posts/1"><a href="https://evil.test/zuck/posts/1">Bad Facebook</a></div>',
        badText: "Bad Facebook",
      },
      {
        brand: "Facebook video",
        name: "facebook-video",
        src: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fzuck%2Fvideos%2F1234567890",
        quote:
          '<div class="fb-video" data-href="https://www.facebook.com/zuck/videos/1234567890"><a href="https://www.facebook.com/zuck/videos/1234567890">View video</a></div>' +
          '<script async src="https://connect.facebook.net/en_US/sdk.js"></script>',
        bad: '<div class="fb-video" data-href="https://evil.test/zuck/videos/1"><a href="https://evil.test/zuck/videos/1">Bad Facebook video</a></div>',
        badText: "Bad Facebook video",
      },
    ])("when the post comes from $brand", ({ name, src, quote, bad, badText }) => {
      it("renders one sandboxed frame on load, with no provider script", async () => {
        const frames = await postFrames(quote);

        expect(frames).toHaveLength(1);
        const [frame] = frames;
        expect(frame).toHaveAttribute("src", src);
        expect(frame).toHaveAttribute("data-embed", name);
        expect(frame).toHaveAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
        );
        expect(document.querySelector("article script")).toBeNull();
      });

      it("keeps a post with an unchecked permalink as a link", async () => {
        const { view } = await withContent({
          entryId: UNREAD_ID,
          content:
            `<p>Body</p>${bad}` +
            '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
        });
        // The YouTube frame says the embed pass ran.
        await waitFor(() => {
          expect(view.container.querySelectorAll("article.prose-reader iframe")).toHaveLength(1);
        });

        expect(await ui.link(view, badText)).toBeInTheDocument();
        expect(view.container.querySelector('iframe[data-embed="' + name + '"]')).toBeNull();
      });
    });

    it("renders only the newsletter frame for a newsletter that carries a YouTube frame", async () => {
      const { view } = await withContent({
        entryId: NEWSLETTER_ID,
        content: '<p>Letter</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      });
      await waitFor(() => {
        expect(ui.frameDocument(view).body.textContent).toContain("Letter");
      });

      expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
      expect(view.container.querySelector(".prose-reader")).toBeNull();
      const doc = ui.frameDocument(view);
      expect(doc.querySelector("iframe")).toBeNull();
    });
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
    await markReadQueue.flush();
    await waitFor(async () => {
      expect(await fixtureUnread(UNREAD_ID)).toBe(false);
    });
  });
});
