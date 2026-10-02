import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "@tanstack/react-router";
import { useEntry, useMarkRead } from "client/api/queries";
import { ReaderHeader } from "client/components/reader/ReaderHeader";
import { readingTime } from "client/utils/readingTime";
import { replaceBrokenImage } from "client/utils/brokenImage";
import { useImageFallback } from "client/hooks/useImageFallback";
import { useResizablePanel } from "client/hooks/useResizablePanel";
import { noViewTransitionRunning } from "client/utils/viewTransition";

// External links inside sanitized article HTML shouldn't inherit the app's own tab/opener.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener");
  }
});

const sanitize = (html: string): string =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe"],
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
// the scrim and Escape both take the "Mark" exit.
export const Reader = ({ entryId, streamKey }: ReaderProps) => {
  const entry = useEntry(entryId);
  const { mutate } = useMarkRead();
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

  const { data } = entry;
  const bodyHtml = data?.fullContent ?? data?.content?.content ?? data?.summary?.content ?? "";
  const html = useMemo(() => (bodyHtml === "" ? "" : sanitize(bodyHtml)), [bodyHtml]);
  const minutes = useMemo(() => (html === "" ? 0 : readingTime(bodyText(html))), [html]);
  const heroUrl = data?.visual?.url;
  const heroInBody = useMemo(
    () => heroUrl !== undefined && html !== "" && bodyHasImage({ html, url: heroUrl }),
    [html, heroUrl],
  );

  const hero = useImageFallback({ url: heroUrl, fallbackUrl: data?.visual?.edgeCacheUrl });

  // `error` does not bubble, so it is caught in the capture phase on the article.
  const watchBodyImages = useCallback((article: HTMLElement) => {
    const onError = (event: Event): void => {
      const { target } = event;
      if (target instanceof Element) replaceBrokenImage(target);
    };
    article.addEventListener("error", onError, true);
    return () => {
      article.removeEventListener("error", onError, true);
    };
  }, []);

  let body: ReactNode;
  if (data === undefined) {
    body = entry.isError ? (
      <p role="alert" className="p-4 text-sm text-danger">
        Article not found.
      </p>
    ) : (
      <p className="p-4 text-sm text-faint">Loading…</p>
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
        <div className="px-4 pt-3 pb-16 sm:px-6">
          {data.author ? <p className="text-[13px] text-muted">{data.author}</p> : null}
          {hero.src && data.visual && !heroInBody ? (
            <img
              src={hero.src}
              alt=""
              width={data.visual.width}
              height={data.visual.height}
              onError={hero.onError}
              className="mx-auto mt-3 mb-5 block h-auto max-h-[45vh] w-auto max-w-full rounded-xl outline outline-hairline-image -outline-offset-1"
            />
          ) : null}
          <article
            ref={watchBodyImages}
            className="prose-reader mt-4"
            dir={data.content?.direction ?? data.summary?.direction ?? "ltr"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
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
            Mark as {openedUnread ? "read" : "unread"} and close
            <kbd>Esc</kbd>
          </p>
        )}
      </div>
      <section
        aria-label="Article"
        style={widthStyle}
        className="reader-panel flex min-h-0 flex-col"
      >
        <div {...separatorProps} />
        <div ref={paneRef} className="min-h-0 flex-1 scroll-pane">
          {body}
        </div>
      </section>
    </>
  );
};
