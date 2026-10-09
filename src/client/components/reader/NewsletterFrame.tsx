import { useCallback, useEffect, useMemo, useRef } from "react";
import { useT } from "client/i18n/useT";
import { replaceBrokenImage } from "client/utils/brokenImage";
import { installExternalLinks } from "client/utils/externalLinks";

// Never `allow-scripts`: beside `allow-same-origin` it would let the email lift the sandbox.
const SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";

// `light-dark()` resolves against the meta's `color-scheme`, so the meta alone picks the palette.
const FRAME_STYLE =
  "html, body { margin: 0; background: light-dark(#fff, #000); color: light-dark(#000, #fff); } html { overflow-y: hidden; overflow-x: auto; } img { max-width: 100%; height: auto; } body { font-family: system-ui, sans-serif; }";

// DOMPurify serializes attributes as `name="value"`. A false match inverts an email that would have worked natively.
const AUTHORED_COLORS = /\s(?:bgcolor|color)=|\sstyle="[^"]*(?:color|background)/i;

// An email that sets any color assumes a white page around it, so a dark OS scheme inverts it
// instead; an uncolored one follows the scheme natively.
const hasAuthoredColors = (html: string): boolean => AUTHORED_COLORS.test(html);

const AUTHORED_DARK_STYLE =
  "html { background: #fff; } @media (prefers-color-scheme: dark) { html { filter: invert(1) hue-rotate(180deg); } img, video, svg { filter: invert(1) hue-rotate(180deg); } }";

const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Frame elements come from another realm, so `instanceof` against this window's classes fails.
const isFieldTarget = (target: EventTarget | null): boolean =>
  !!target &&
  (("tagName" in target && typeof target.tagName === "string" && FIELD_TAGS.has(target.tagName)) ||
    ("isContentEditable" in target && target.isContentEditable === true));

const isImage = (target: EventTarget | null): target is HTMLImageElement =>
  !!target && "tagName" in target && target.tagName === "IMG";

interface NewsletterFrameProps {
  /** Body HTML, already sanitized by the caller. */
  html: string;
  /** Text direction of the entry. */
  dir: "ltr" | "rtl";
  /** The frame's document, once set up. */
  onDocument?: (doc: Document) => void;
}

// Emails assume a browser-default stylesheet, so they render in a sandboxed frame
// sized to its content, so the reader's pane does all the scrolling.
// Listeners are attached from here because no script runs inside the frame.
export const NewsletterFrame = ({ html, dir, onDocument }: NewsletterFrameProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const setupRef = useRef<{ doc: Document; teardown: () => void } | null>(null);

  const t = useT();
  const labelsRef = useRef(t.articles);
  useEffect(() => {
    labelsRef.current = t.articles;
  }, [t]);
  const onDocumentRef = useRef(onDocument);
  useEffect(() => {
    onDocumentRef.current = onDocument;
  }, [onDocument]);

  const authored = useMemo(() => hasAuthoredColors(html), [html]);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="${authored ? "light" : "light dark"}"><style>${FRAME_STYLE}${authored ? ` ${AUTHORED_DARK_STYLE}` : ""}</style></head><body>${html}</body></html>`,
    [html, dir, authored],
  );

  const attach = useCallback((frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument;
    // The frame's own realm, so its observer watches its document. Window's type omits the class.
    const win: (Window & { ResizeObserver?: typeof ResizeObserver }) | null = frame.contentWindow;
    if (!doc || !win || setupRef.current?.doc === doc) return;
    setupRef.current?.teardown();
    const root = doc.documentElement;

    // `scrollHeight` never drops below the frame's own height, so the frame could not shrink. The
    // horizontal scrollbar is added so it never covers the last line.
    let zoom = 1;
    const fit = () => {
      const scrollbar = Math.max(0, win.innerHeight - root.clientHeight);
      frame.style.height = `${Math.ceil(root.getBoundingClientRect().height) + scrollbar}px`;
    };
    const resize = () => {
      // Reset first so the natural width is measured; growth under 1% keeps the last zoom, so
      // the scrollbar the zoom adds or removes cannot loop; a decrease always applies so it fits.
      doc.body.style.zoom = "";
      fit();
      const natural = root.scrollWidth;
      const room = root.clientWidth;
      const next = natural > room ? Math.floor((room / natural) * 1000) / 1000 : 1;
      if (next < zoom || next - zoom >= 0.01) zoom = next;
      doc.body.style.zoom = zoom === 1 ? "" : String(zoom);
      fit();
    };
    resize();
    onDocumentRef.current?.(doc);
    // Images load after setup. jsdom has no ResizeObserver.
    const observer = win.ResizeObserver === undefined ? null : new win.ResizeObserver(resize);
    observer?.observe(root);

    // Key events inside a frame never reach the parent document, where the reader's shortcuts
    // listen. A field or an IME composition is skipped: the parent's typing guards cannot see it.
    const forwardKey = (key: KeyboardEvent) => {
      if (key.isComposing || isFieldTarget(key.target)) return;
      const handled = !document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: key.key,
          code: key.code,
          altKey: key.altKey,
          ctrlKey: key.ctrlKey,
          metaKey: key.metaKey,
          shiftKey: key.shiftKey,
          repeat: key.repeat,
          bubbles: true,
          cancelable: true,
        }),
      );
      if (handled) key.preventDefault();
    };
    doc.addEventListener("keydown", forwardKey);

    // Images that failed before this listener existed only show as complete with no width.
    for (const img of doc.querySelectorAll("img")) {
      if (img.getAttribute("src") && img.complete && img.naturalWidth === 0)
        replaceBrokenImage({ img, labels: labelsRef.current });
    }
    const onError = (error: Event) => {
      if (isImage(error.target))
        replaceBrokenImage({ img: error.target, labels: labelsRef.current });
    };
    doc.addEventListener("error", onError, true);
    const removeLinks = installExternalLinks(doc);

    setupRef.current = {
      doc,
      teardown: () => {
        observer?.disconnect();
        doc.removeEventListener("keydown", forwardKey);
        doc.removeEventListener("error", onError, true);
        removeLinks();
      },
    };
  }, []);

  // `load` waits for every image, so one slow image would hold the frame at 150px with no Escape.
  // Setup starts once the document is parsed; `load` stays as a fallback, as in jsdom. The previous
  // document is skipped, as it stays in place until the new `srcdoc` replaces it.
  useEffect(() => {
    const frame = frameRef.current;
    const previous = setupRef.current?.doc;
    let id = 0;
    const poll = () => {
      const doc = frame?.contentDocument;
      if (
        frame &&
        doc &&
        doc !== previous &&
        doc.URL === "about:srcdoc" &&
        doc.readyState !== "loading"
      )
        attach(frame);
      else id = requestAnimationFrame(poll);
    };
    poll();
    return () => {
      cancelAnimationFrame(id);
    };
  }, [srcDoc, attach]);

  useEffect(
    () => () => {
      setupRef.current?.teardown();
      setupRef.current = null;
    },
    [],
  );

  return (
    <iframe
      sandbox={SANDBOX}
      title={t.articles.newsletter}
      className="newsletter-frame"
      srcDoc={srcDoc}
      ref={frameRef}
      onLoad={(event) => {
        attach(event.currentTarget);
      }}
    />
  );
};
