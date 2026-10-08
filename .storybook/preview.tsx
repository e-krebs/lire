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
  },
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    docs: { container: ThemedDocsContainer },
    controls: { matchers: { date: /At$/ } },
  },
};

export default preview;
