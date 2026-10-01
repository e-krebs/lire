import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { router } from "./router";
import { queryClient } from "./api/queryClient";
import "./styles.css";

registerSW({ immediate: true });

// Every color token flips in the same frame as the OS scheme, so any running transition would
// cross-fade the whole app; styles.css kills them while the attribute is set.
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
darkScheme.addEventListener("change", () => {
  document.documentElement.setAttribute("data-theme-switching", "");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.removeAttribute("data-theme-switching");
    });
  });
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
