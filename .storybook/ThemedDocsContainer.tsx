import { DocsContainer } from "@storybook/addon-docs/blocks";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { themes } from "storybook/theming";

const query = "(prefers-color-scheme: dark)";

export function ThemedDocsContainer(props: ComponentProps<typeof DocsContainer>) {
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return <DocsContainer {...props} theme={dark ? themes.dark : themes.light} />;
}
