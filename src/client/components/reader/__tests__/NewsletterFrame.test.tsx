import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  return {
    doc,
    received,
    view,
    press: ({ target, init }: { target: Element; init: KeyboardEventInit }) =>
      fireEvent.keyDown(target, init),
  };
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
