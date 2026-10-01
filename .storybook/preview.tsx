import type { Preview } from "@storybook/react-vite";
import "../src/client/styles.css";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    controls: { matchers: { date: /At$/ } },
  },
};

export default preview;
