import { useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";

const read = (): "light" | "dark" => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK).matches ? "dark" : "light";
};

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
};

export const useColorScheme = (): "light" | "dark" =>
  useSyncExternalStore(subscribe, read, () => "light");
