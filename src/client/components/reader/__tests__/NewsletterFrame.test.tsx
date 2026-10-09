import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { usePull } from "client/hooks/usePullToRefresh";
import { NewsletterFrame } from "../NewsletterFrame";

const HTML =
  '<p id="text">Hello</p><input id="field"><img id="broken" src="https://example.test/x.png" alt="Logo"><img id="pixel" src="https://example.test/p.png" width="1" height="1">';

const ui = {
  get frame() {
    return screen.getByTitle<HTMLIFrameElement>("Newsletter");
  },
};

const setup = () => {
  const view = render(<NewsletterFrame html={HTML} dir="ltr" />);
  const doc = ui.frame.contentDocument!;
  // jsdom does not load `srcdoc`, so the frame holds a blank document to fill.
  doc.body.innerHTML = HTML;
  // jsdom never finishes an image, so mark the broken one as failed-before-load.
  Object.defineProperty(doc.getElementById("broken")!, "complete", { value: true });
  fireEvent.load(ui.frame);
  const received = vi.fn<(event: KeyboardEvent) => void>();
  document.addEventListener("keydown", received);
  // Files share one document, so a leftover listener would cancel other files' keys.
  onTestFinished(() => {
    document.removeEventListener("keydown", received);
  });
  return {
    doc,
    received,
    view,
    press: ({ target, init }: { target: Element; init: KeyboardEventInit }) =>
      fireEvent.keyDown(target, init),
  };
};

// The reader's wiring, cut down: a bottom pull on the pane that also listens in the frame.
const PullHarness = ({ onCommit }: { onCommit: () => undefined }) => {
  const [frame, setFrame] = useState<Document | null>(null);
  const { attach, pull } = usePull({
    onCommit,
    frameDocument: frame,
    pullDown: false,
    pullUp: true,
  });
  return (
    <div className="scroll-pane">
      <div ref={attach} data-edge={pull?.edge}>
        <NewsletterFrame html={HTML} dir="ltr" onDocument={setFrame} />
      </div>
    </div>
  );
};

// jsdom has no TouchEvent constructor that takes touches, so the list is planted. jsdom reports
// every box as 0, which puts the pane at its end from the start.
const swipeUp = (target: Element): void => {
  const send = (type: string, ys: number[]): void => {
    const view = target.ownerDocument.defaultView!;
    const event = new view.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: ys.map((clientY) => ({ clientX: 0, clientY })),
    });
    fireEvent(target, event);
  };
  send("touchstart", [400]);
  for (let step = 1; step <= 10; step += 1) send("touchmove", [400 - 20 * step]);
  send("touchend", []);
};

describe("NewsletterFrame", () => {
  it("renders a sandboxed frame without scripts", () => {
    setup();

    expect(ui.frame.getAttribute("sandbox")).toBe(
      "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    );
    expect(ui.frame.srcdoc).toContain('<html dir="ltr">');
  });

  it("sets a pixel height after load", () => {
    setup();

    expect(ui.frame.style.height).toMatch(/^\d+px$/);
  });

  it("fits the frame to the content however tall", () => {
    render(<NewsletterFrame html={HTML} dir="ltr" />);
    const root = ui.frame.contentDocument!.documentElement;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => new DOMRect(0, 0, 0, 50_000),
    });
    Object.defineProperty(root, "clientHeight", { value: ui.frame.contentWindow!.innerHeight });
    fireEvent.load(ui.frame);

    expect(ui.frame.style.height).toBe("50000px");
  });

  it("sets up once the document is parsed, before load", async () => {
    render(<NewsletterFrame html={HTML} dir="ltr" />);
    Object.defineProperty(ui.frame.contentDocument!, "URL", { value: "about:srcdoc" });

    await waitFor(() => {
      expect(ui.frame.style.height).toMatch(/^\d+px$/);
    });
  });

  describe("when a key is pressed inside the frame", () => {
    it("forwards it to the parent document", () => {
      const { doc, received, press } = setup();

      press({
        target: doc.getElementById("text")!,
        init: { key: "Escape", code: "Escape", shiftKey: true },
      });

      expect(received).toHaveBeenCalledTimes(1);
      expect(received.mock.calls[0][0]).toMatchObject({
        key: "Escape",
        code: "Escape",
        shiftKey: true,
      });
    });

    it("cancels the original when the parent cancels the forwarded one", () => {
      const { doc, received, press } = setup();
      received.mockImplementation((event) => {
        event.preventDefault();
      });

      expect(press({ target: doc.getElementById("text")!, init: { key: "/" } })).toBe(false);
    });

    it("skips a key typed in a field", () => {
      const { doc, received, press } = setup();

      press({ target: doc.getElementById("field")!, init: { key: "j" } });

      expect(received).not.toHaveBeenCalled();
    });

    it("skips a key during IME composition", () => {
      const { doc, received, press } = setup();

      press({ target: doc.getElementById("text")!, init: { key: "j", isComposing: true } });

      expect(received).not.toHaveBeenCalled();
    });
  });

  describe("when an image fails", () => {
    it("replaces the one found broken on load with a placeholder", () => {
      const { doc } = setup();

      expect(doc.getElementById("broken")).toBeNull();
      expect(doc.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
        "Image unavailable: Logo",
      );
    });

    it("replaces a later failure", () => {
      const { doc } = setup();
      const late = doc.createElement("img");
      late.setAttribute("src", "https://example.test/late.png");
      doc.body.append(late);

      fireEvent.error(late);

      expect(late.isConnected).toBe(false);
    });
  });

  describe("when the email is wider than the frame", () => {
    const WIDE =
      '<table width="100%"><tr><td><table width="600"><tr><td>Invented weekly digest</td></tr></table></td></tr></table>';

    // jsdom has no layout, so the widths are planted and the observer callback is captured.
    const renderWide = ({ dir = "ltr" }: { dir?: "ltr" | "rtl" } = {}) => {
      const view = render(<NewsletterFrame html={WIDE} dir={dir} />);
      const win = ui.frame.contentWindow!;
      let notify = () => {};
      Object.defineProperty(win, "ResizeObserver", {
        configurable: true,
        value: class {
          constructor(callback: () => void) {
            notify = callback;
          }
          observe() {}
          disconnect() {}
        },
      });
      const doc = ui.frame.contentDocument!;
      doc.body.innerHTML = WIDE;
      const widths = { natural: 604, room: 390 };
      Object.defineProperty(doc.documentElement, "scrollWidth", { get: () => widths.natural });
      Object.defineProperty(doc.documentElement, "clientWidth", { get: () => widths.room });
      fireEvent.load(ui.frame);
      return {
        body: doc.body,
        widths,
        view,
        resize: ({ natural, room }: { natural: number; room: number }) => {
          widths.natural = natural;
          widths.room = room;
          notify();
        },
      };
    };

    it("zooms the body to the floored ratio", () => {
      const { body } = renderWide();

      expect(body.style.zoom).toBe("0.645");
    });

    it("zooms the same when the text runs right to left", () => {
      const { body } = renderWide({ dir: "rtl" });

      expect(body.style.zoom).toBe("0.645");
    });

    it("leaves a narrow email alone", () => {
      const { body, resize } = renderWide();

      resize({ natural: 300, room: 390 });

      expect(body.style.zoom).toBe("");
    });

    it("drops the zoom once the room grows", () => {
      const { body, resize } = renderWide();

      resize({ natural: 604, room: 700 });

      expect(body.style.zoom).toBe("");
    });

    it("keeps the zoom for growth under 1%", () => {
      const { body, resize } = renderWide();

      resize({ natural: 604, room: 393 });

      expect(body.style.zoom).toBe("0.645");
    });

    it("shrinks the zoom for a narrowing under 1%", () => {
      const { body, resize } = renderWide();

      resize({ natural: 604, room: 385 });

      expect(body.style.zoom).toBe("0.637");
    });
  });

  describe("when the frame reports its document", () => {
    it("reports its document once set up", () => {
      const onDocument = vi.fn<(doc: Document) => void>();
      render(<NewsletterFrame html={HTML} dir="ltr" onDocument={onDocument} />);
      fireEvent.load(ui.frame);

      expect(onDocument).toHaveBeenCalledExactlyOnceWith(ui.frame.contentDocument);
    });

    it("lets a touch gesture inside the frame pull the pane", () => {
      const onCommit = vi.fn<() => undefined>();
      render(<PullHarness onCommit={onCommit} />);
      const doc = ui.frame.contentDocument!;
      doc.body.innerHTML = HTML;
      fireEvent.load(ui.frame);

      swipeUp(doc.getElementById("text")!);

      expect(onCommit).toHaveBeenCalledExactlyOnceWith({ edge: "bottom" });
    });
  });

  describe("when picking the page colors", () => {
    const renderFrame = (html: string) => render(<NewsletterFrame html={html} dir="ltr" />);

    it("follows the OS scheme when the email sets no colors", () => {
      renderFrame("<p>Hello</p>");

      expect(ui.frame.srcdoc).toContain('<meta name="color-scheme" content="light dark">');
      expect(ui.frame.srcdoc).toContain("background: light-dark(#fff, #000)");
      expect(ui.frame.srcdoc).not.toContain("invert(");
    });

    it.each([
      ['<p style="color: #000">Hello</p>'],
      ['<td style="background-color: #fafafa">Hello</td>'],
      ['<table bgcolor="#ffffff"><tr><td>Hello</td></tr></table>'],
      ['<font color="#333">Hello</font>'],
    ])("inverts in dark mode as authored for %s", (html) => {
      renderFrame(html);

      expect(ui.frame.srcdoc).toContain('<meta name="color-scheme" content="light">');
      expect(ui.frame.srcdoc).toContain("prefers-color-scheme: dark");
      expect(ui.frame.srcdoc).toContain("html { filter: invert(1) hue-rotate(180deg); }");
      expect(ui.frame.srcdoc).toContain(
        "img, video, svg { filter: invert(1) hue-rotate(180deg); }",
      );
    });
  });

  describe("when the frame unmounts", () => {
    it("stops forwarding keys", () => {
      const { doc, received, press, view } = setup();
      const target = doc.getElementById("text")!;

      view.unmount();
      press({ target, init: { key: "Escape" } });

      expect(received).not.toHaveBeenCalled();
    });
  });
});
