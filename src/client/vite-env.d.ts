/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: "mock" | "real";
  readonly VITE_DEMO?: "true";
  readonly VITE_FIXTURES?: "real" | "seed";
  readonly VITE_APP_VERSION?: string;
  readonly VITE_FIXTURE_LATENCY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
