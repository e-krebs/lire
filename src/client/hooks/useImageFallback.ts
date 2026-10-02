import { useState } from "react";

interface Params {
  url?: string | undefined;
  fallbackUrl?: string | undefined;
}

interface ImageFallback {
  // undefined once both URLs failed: render no <img>.
  src: string | undefined;
  onError: () => void;
}

export const useImageFallback = ({ url, fallbackUrl }: Params): ImageFallback => {
  const [state, setState] = useState({ url, fallbackUrl, failures: 0 });
  // Derived during render so a recycled tile or a refreshed proxy URL starts over on `url`.
  let current = state;
  if (state.url !== url || state.fallbackUrl !== fallbackUrl) {
    current = { url, fallbackUrl, failures: 0 };
    setState(current);
  }

  const hasFallback = fallbackUrl !== undefined && fallbackUrl !== url;
  const usable = hasFallback ? 2 : 1;
  const { failures } = current;
  const src = failures >= usable ? undefined : failures === 0 ? url : fallbackUrl;

  const onError = () => {
    setState((prev) =>
      prev.url === url && prev.fallbackUrl === fallbackUrl
        ? { ...prev, failures: prev.failures + 1 }
        : prev,
    );
  };

  return { src, onError };
};
