import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "@tanstack/react-router";
import { useEntry, useFeeds, useMark } from "client/api/queries";
import { PullAction } from "client/components/articles/PullIndicator";
import { NewsletterFrame } from "client/components/reader/NewsletterFrame";
import { ReaderHeader } from "client/components/reader/ReaderHeader";
import { readingTime } from "client/utils/readingTime";
import { useT } from "client/i18n/useT";
import { replaceBrokenImage } from "client/utils/brokenImage";
import { EMBED_ALLOW, EMBED_SANDBOX, embedQuotes, iframeEmbed } from "client/utils/embeds";
import { useImageFallback } from "client/hooks/useImageFallback";
import { usePull } from "client/hooks/usePullToRefresh";
import { useResizablePanel } from "client/hooks/useResizablePanel";
import { noViewTransitionRunning } from "client/utils/viewTransition";

// External links inside sanitized article HTML shouldn't inherit the app's own tab/opener.
const openLinksAway = (node: Element): void => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener");
  }
};
DOMPurify.addHook("afterSanitizeAttributes", openLinksAway);

const sanitizeNewsletter = (html: string): string =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe"],
  });

// Hooks are per instance, so the iframe ones live on their own and never touch the newsletter
// pass. `iframe` has to leave FORBID_TAGS, because that list wins over any hook.
const postPurify = DOMPurify(window);
postPurify.addHook("afterSanitizeAttributes", openLinksAway);
postPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe" || !(node instanceof Element)) return;
  const embed = iframeEmbed({ src: node.getAttribute("src") ?? "" });
  if (embed === null) node.remove();
  else node.setAttribute("src", embed.src);
});
// Set after the attribute pass, which would drop them: DOMPurify's default list has none of these.
postPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IFRAME") return;
  const embed = iframeEmbed({ src: node.getAttribute("src") ?? "" });
  if (embed !== null) node.setAttribute("data-embed", embed.name);
  node.setAttribute("allow", EMBED_ALLOW);
  node.setAttribute("allowfullscreen", "");
  node.setAttribute("loading", "lazy");
  node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  node.setAttribute("sandbox", EMBED_SANDBOX);
});

// CSS `:only-child` and `:has()` ignore text nodes, so only the text tells a lone image from one in a line.
const INLINE_WRAPPERS = new Set(["A", "SPAN", "EM", "STRONG", "B", "I", "U", "SMALL", "MARK"]);
postPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IMG" || node.classList.contains("emoji")) return;
  let container = node.parentElement;
  while (container && INLINE_WRAPPERS.has(container.tagName)) container = container.parentElement;
  if (container === null) return;
  if (container.textContent.trim() === "" && container.querySelectorAll("img").length === 1) {
    node.setAttribute("data-lone", "");
  }
});

const sanitizePost = (html: string): string =>
  embedQuotes({
    html: postPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "style"],
      ADD_TAGS: ["iframe"],
    }),
  });

// The reading estimate counts the words the reader actually sees, so it reads them off the
// sanitized markup. Parsed into its own document: no script runs and nothing enters this one.
const bodyText = (html: string): string =>
  new DOMParser().parseFromString(html, "text/html").body.textContent;

// A third of the recorded feeds put the same picture in `visual` and in the body, so the hero would
// show it twice. Same host and path is the same picture; a query string or a size suffix is not
// enough to call it one, because the hero is then usually the larger copy.
const bodyHasImage = ({ html, url }: { html: string; url: string }): boolean => {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const images = new DOMParser().parseFromString(html, "text/html").images;
  return [...images].some((img) => {
    try {
      const src = new URL(img.getAttribute("src") ?? "", target);
      return src.host === target.host && src.pathname === target.pathname;
    } catch {
      return false;
    }
  });
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

interface ReaderProps {
  /** Id of the entry to open. */
  entryId: string;
  /** Route key of the stream the reader was opened from, which closing navigates back to. */
  streamKey: string;
}

// At `lg`+ the panel floats over the results grid behind a scrim; below it, it is the only pane.
// Leaving is the only way to mark the entry: "Keep" navigates, "Mark" mutates then navigates, and
// the scrim, Escape and a pull up past the article's end all take the "Mark" exit.
export const Reader = ({ entryId, streamKey }: ReaderProps) => {
  const t = useT();
  const entry = useEntry(entryId);
  const feeds = useFeeds();
  const { mutate } = useMark();
  const navigate = useNavigate();
  const paneRef = useRef<HTMLDivElement>(null);
  const { width, separatorProps } = useResizablePanel();

  // Both exits name the state the entry was in when the panel opened, so the origin is captured
  // once per entryId — the optimistic flip must not rename the buttons under the pointer. Set
  // during render, which is how React derives state from a changed prop without an extra pass.
  const [opened, setOpened] = useState<{ entryId: string; unread: boolean } | null>(null);
  const unread = entry.data?.unread;
  if (unread !== undefined && opened?.entryId !== entryId) setOpened({ entryId, unread });
  const openedUnread = opened?.entryId === entryId ? opened.unread : undefined;

  const close = useCallback(
    (mark: boolean): void => {
      if (mark && openedUnread !== undefined) mutate({ entryIds: [entryId], read: openedUnread });
      void navigate({
        to: "/stream/$streamKey",
        params: { streamKey },
        search: (prev) => prev,
        viewTransition: noViewTransitionRunning(),
      });
    },
    [entryId, mutate, navigate, openedUnread, streamKey],
  );

  const { data } = entry;
  const bodyHtml = data?.content ?? data?.summary ?? "";
  // Decided before sanitizing: the newsletter pass must never let an embed frame into its srcdoc.
  // Until the feeds load, a newsletter shows inline, so embeds wait for them too.
  const feed = feeds.data?.find(({ id }) => id === data?.feedId);
  const newsletter = bodyHtml !== "" && feed?.isNewsletter === true;

  // Touch only, and only up: a pull down at the top stays the browser's. It waits for the origin
  // state, since the band names the exit. A newsletter has no pull: its srcdoc frame keeps touch
  // events in its own document, so they never reach the pane.
  const { attach: attachPull, pull } = usePull({
    onCommit: () => {
      close(true);
    },
    pullDown: false,
    pullUp: openedUnread !== undefined && !newsletter,
  });

  // The tooltip layer already swallows nothing on Escape, so this listener is its own: bubble
  // phase, and never while text is being typed.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) return;
      close(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  const embeds = feeds.data !== undefined && !newsletter;
  const html = useMemo(() => {
    if (bodyHtml === "") return "";
    return embeds ? sanitizePost(bodyHtml) : sanitizeNewsletter(bodyHtml);
  }, [bodyHtml, embeds]);
  const minutes = useMemo(() => (html === "" ? 0 : readingTime(bodyText(html))), [html]);
  const heroUrl = data?.imageUrl;
  const heroInBody = useMemo(
    () => heroUrl !== undefined && html !== "" && bodyHasImage({ html, url: heroUrl }),
    [html, heroUrl],
  );

  const hero = useImageFallback({ url: heroUrl });

  // `error` does not bubble, so it is caught in the capture phase on the article.
  const watchBodyImages = useCallback(
    (article: HTMLElement) => {
      const onError = (event: Event): void => {
        const { target } = event;
        if (target instanceof Element) replaceBrokenImage({ img: target, labels: t.articles });
      };
      article.addEventListener("error", onError, true);
      return () => {
        article.removeEventListener("error", onError, true);
      };
    },
    [t],
  );

  const pullStyle: CSSProperties & { "--pull": string } = { "--pull": `${pull?.distance ?? 0}px` };

  let body: ReactNode;
  if (data === undefined) {
    body = entry.isError ? (
      <p role="alert" className="p-4 text-sm text-danger">
        {t.articles.articleNotFound}
      </p>
    ) : (
      <p className="p-4 text-sm text-faint">{t.common.loading}</p>
    );
  } else {
    body = (
      <>
        <ReaderHeader
          entry={data}
          minutes={minutes}
          openedUnread={openedUnread}
          paneRef={paneRef}
          onKeep={() => {
            close(false);
          }}
          onMark={() => {
            close(true);
          }}
        />
        <div
          ref={attachPull}
          className="pull-content px-4 pt-3 pb-16 sm:px-6"
          data-edge={pull?.edge}
          data-released={pull?.released || undefined}
          style={pullStyle}
        >
          {data.author ? <p className="text-[13px] text-muted">{data.author}</p> : null}
          {hero.src && !heroInBody ? (
            <img
              src={hero.src}
              alt=""
              onError={hero.onError}
              className="mx-auto mt-3 mb-5 block h-auto max-h-[45vh] w-auto max-w-full rounded-xl outline outline-hairline-image -outline-offset-1"
            />
          ) : null}
          {newsletter ? (
            <article className="-mx-4 mt-4 sm:-mx-6">
              <NewsletterFrame html={html} dir="ltr" />
            </article>
          ) : (
            <article
              ref={watchBodyImages}
              className="prose-reader mt-4"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </>
    );
  }

  // Both halves read the panel's width: the scrim centres its label on the strip left of it.
  const widthStyle: CSSProperties & { "--reader-w": string } = { "--reader-w": `${width}px` };

  return (
    <>
      <div
        aria-hidden="true"
        style={widthStyle}
        className="reader-scrim"
        onClick={() => {
          close(true);
        }}
      >
        {openedUnread === undefined ? null : (
          <p className="reader-scrim-label">
            {openedUnread ? t.articles.markReadAndClose : t.articles.markUnreadAndClose}
            <kbd>{t.articles.escapeKey}</kbd>
          </p>
        )}
      </div>
      <section
        aria-label={t.articles.article}
        style={widthStyle}
        className="reader-panel flex min-h-0 flex-col"
      >
        <div {...separatorProps} />
        <div ref={paneRef} className="min-h-0 flex-1 scroll-pane">
          {body}
        </div>
        {openedUnread === undefined ? null : <PullAction pull={pull} read={openedUnread} />}
      </section>
    </>
  );
};
