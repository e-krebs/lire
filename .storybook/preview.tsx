import type { Preview } from "@storybook/react-vite";
import { setLocalePreference } from "../src/client/i18n/locale";
import "../src/client/styles.css";
import "./preview.css";
import { ThemedDocsContainer } from "./ThemedDocsContainer";

const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
    locale: {
      description: "UI language",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: [
          { value: "en", title: "English" },
          { value: "fr", title: "Français" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "en" },
  beforeEach: ({ globals }) => {
    setLocalePreference(globals.locale === "fr" ? "fr" : "en");
    // Headless Chromium 159 crashes the page on the first view transition (Playwright 1.65.1).
    document.startViewTransition = (update) => {
      const done = Promise.resolve(typeof update === "function" ? update() : undefined).then(
        () => {},
      );
      return {
        finished: done,
        ready: done,
        updateCallbackDone: done,
        skipTransition: () => {},
      } as ViewTransition;
    };
  },
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    docs: { container: ThemedDocsContainer },
    controls: { matchers: { date: /At$/ } },
    options: {
      storySort: {
        method: "alphabetical",
        order: [
          "Primitives",
          ["Controls", "Icons", "Overlays"],
          "App",
          ["Account", "Android", "Auth", "Credits", "Demo", "Notices", "Onboarding", "Shell"],
          "Header",
          ["Top bar", "Location", "Views"],
          "Browse menu",
          ["Menu", "Rows"],
          "Feed",
          ["Mosaic", "Status"],
          "Reader",
          ["Article"],
          "Subscriptions",
          ["Manager", "Feeds", "Categories"],
        ],
      },
    },
  },
};

export default preview;
