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

// Above this relative luminance a page is white enough that the invert reads as intended.
const PAGE_LUMINANCE_CEILING = 0.9;

type Color = { rgb: [number, number, number]; alpha: number };

const parseColor = (value: string): Color | null => {
  const hex = /#([\da-f]{3}|[\da-f]{6})\b/i.exec(value);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    const n = parseInt(digits, 16);
    return { rgb: [n >> 16, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const fn = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)/i.exec(value);
  if (!fn) return null;
  return {
    rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
    alpha: fn[4] ? Number(fn[4]) : 1,
  };
};

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ rgb: [r, g, b] }: Color): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const declared = ({ style, property }: { style: string; property: string }): string | undefined =>
  new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i").exec(style)?.[1];

// The email's own page is its root table, which sits under a hidden preheader table in some
// newsletters. Inline CSS overrides `bgcolor`, so it is read first, and a named color that
// parseColor cannot read still overrides it.
const hasOwnPageBackground = (html: string): boolean => {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const root =
    [...body.querySelectorAll("table")].find(
      (table) =>
        !table.parentElement?.closest("table") &&
        !/display:\s*none/i.test(table.getAttribute("style") ?? ""),
    ) ?? body.firstElementChild;
  if (!root) return false;
  const style = root.getAttribute("style") ?? "";
  const declaredBackground = [
    declared({ style, property: "background-color" }),
    declared({ style, property: "background" })?.replace(/url\([^)]*\)/gi, ""),
  ].find((value) => value !== undefined);
  const page = parseColor(declaredBackground ?? root.getAttribute("bgcolor") ?? "");
  return !!page && page.alpha === 1 && luminance(page) < PAGE_LUMINANCE_CEILING;
};

// An email styled by classes but with next to no inline style lost its `<style>` upstream, which
// took its column and rhythm along. A table means the layout is inline, so it is left alone.
const hasStrippedStyle = (html: string): boolean =>
  !/<table[\s>]/i.test(html) &&
  (html.match(/\sclass="/g)?.length ?? 0) > (html.match(/\sstyle="/g)?.length ?? 0);

const STRIPPED_STYLE = [
  "body { box-sizing: border-box; max-width: 42rem; margin-inline: auto; padding: 1rem; line-height: 1.55; }",
  "h1, h2, h3 { line-height: 1.25; margin-block: 1.5em 0.5em; }",
  "h1 { font-size: 1.75em; } h2 { font-size: 1.4em; } h3 { font-size: 1.15em; }",
  "a { color: light-dark(#0b57d0, #8ab4f8); text-underline-offset: 0.15em; }",
  "hr { margin-block: 2em; }",
  "ul, ol { margin-block: 1em; padding-inline-start: 1.5em; } li { margin-block: 0.4em; } li > p { margin-block: 0.4em; }",
  "blockquote { margin-inline: 0; padding-inline-start: 1em; border-inline-start: 3px solid light-dark(#d0d0d0, #444); }",
  "code, pre { font-family: ui-monospace, monospace; font-size: 0.9em; background: light-dark(#f2f2f2, #222); border-radius: 0.25rem; } code { padding: 0.1em 0.3em; } pre { padding: 0.75em 1em; overflow-x: auto; } pre code { padding: 0; background: none; }",
].join(" ");

const AUTHORED_DARK_STYLE =
  "html { background: #fff; } @media (prefers-color-scheme: dark) { html { filter: invert(1) hue-rotate(180deg); } .lire-emoji { display: inline-block; } img, video, svg, .lire-emoji { filter: invert(1) hue-rotate(180deg); } }";

// A bare pictograph like © stays text: only emoji presentation, a VS16 pair, a keycap, a flag or a
// ZWJ sequence. Tag sequences (subdivision flags) and a trailing VS15 stay in the match.
const EMOJI =
  /[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\uFE0F|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]+|\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F?))*\uFE0E?/gu;

const SKIPPED_TEXT_PARENTS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "TITLE"]);

// Emoji are text nodes, so the page invert would darken them; a span takes the second invert.
const wrapEmoji = (doc: Document): void => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      node instanceof doc.defaultView!.Text &&
      !SKIPPED_TEXT_PARENTS.has(node.parentElement?.tagName ?? "") &&
      !node.parentElement?.closest("svg") &&
      new RegExp(EMOJI).test(node.data)
    )
      nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    let last = 0;
    for (const match of node.data.matchAll(EMOJI)) {
      fragment.append(node.data.slice(last, match.index));
      const span = doc.createElement("span");
      span.className = "lire-emoji";
      span.textContent = match[0];
      fragment.append(span);
      last = match.index + match[0].length;
    }
    fragment.append(node.data.slice(last));
    node.replaceWith(fragment);
  }
};

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
  const ownBackground = useMemo(() => hasOwnPageBackground(html), [html]);
  const inverted = authored && !ownBackground;
  const stripped = useMemo(() => hasStrippedStyle(html), [html]);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="${authored ? "light" : "light dark"}"><style>${FRAME_STYLE}${stripped ? ` ${STRIPPED_STYLE}` : ""}${inverted ? ` ${AUTHORED_DARK_STYLE}` : ""}</style></head><body>${html}</body></html>`,
    [html, dir, authored, inverted, stripped],
  );

  const invertedRef = useRef(inverted);
  useEffect(() => {
    invertedRef.current = inverted;
  }, [inverted]);

  const attach = useCallback((frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument;
    // The frame's own realm, so its observer watches its document. Window's type omits the class.
    const win: (Window & { ResizeObserver?: typeof ResizeObserver }) | null = frame.contentWindow;
    if (!doc || !win || setupRef.current?.doc === doc) return;
    setupRef.current?.teardown();
    const root = doc.documentElement;
    if (invertedRef.current) wrapEmoji(doc);

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
    <>
      {stripped ? (
        <p
          role="status"
          className="mx-4 mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-text sm:mx-6"
        >
          {t.articles.newsletterStyleLost}
        </p>
      ) : null}
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
    </>
  );
};
