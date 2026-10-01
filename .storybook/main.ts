import type { StorybookConfig } from "@storybook/react-vite";

// The app's Vite config carries plugins that only make sense for the real app: the route
// generator, the PWA service worker, and a second React plugin next to Storybook's own.
const APP_ONLY_PLUGINS = /^(tanstack|vite-plugin-pwa|vite:react)/;

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/__stories__/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: (viteConfig.plugins ?? []).flat().filter((plugin) => {
      const name = plugin && typeof plugin === "object" && "name" in plugin ? plugin.name : "";
      return !APP_ONLY_PLUGINS.test(name);
    }),
  }),
};

export default config;
