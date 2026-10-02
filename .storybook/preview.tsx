import type { Preview } from "@storybook/react-vite";
import { setLocalePreference } from "../src/client/i18n/locale";
import "../src/client/styles.css";

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
    controls: { matchers: { date: /At$/ } },
  },
};

export default preview;
