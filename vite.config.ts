import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const appVersion = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion) },
  server: {
    port: 3000,
    host: true,
  },
  base: "/",
  resolve: { tsconfigPaths: true },
  // tanstackRouter must precede viteReact so generated routes are transformed.
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/client/routes",
      generatedRouteTree: "src/client/routeTree.gen.ts",
      // __tests__ folders aren't routes; without this the plugin warns on every test file.
      routeFileIgnorePattern: "__tests__",
    }),
    viteReact(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/client",
      filename: "sw.ts",
      registerType: "autoUpdate",
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "Lire",
        short_name: "Lire",
        description: "A calm reader for your feeds",
        display: "standalone",
        theme_color: "#1f1f1f",
        background_color: "#ffffff",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,webp,ico,woff2}"] },
    }),
  ],
});
