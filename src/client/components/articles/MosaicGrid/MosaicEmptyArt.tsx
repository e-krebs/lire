import { useState } from "react";

const scenes = [
  "hammock",
  "bath",
  "spring",
  "autumn",
  "winter",
  "fishing",
  "cat",
  "rooftop",
  "boat",
  "beach",
  "alpine-lake",
  "bivouac",
  "hut-terrace",
  "coastal-bench",
  "lighthouse-jetty",
  "granite-cottage",
] as const;

// Vite turns this template into a glob over the folder and bundles every match.
const src = ({ scene, theme }: { scene: string; theme: "light" | "dark" }): string =>
  new URL(`../../../assets/empty/${scene}-${theme}.webp`, import.meta.url).href;

// Decorative (alt=""): the text below says the list is empty.
export function MosaicEmptyArt() {
  // Picked once per mount, so a re-render does not swap the scene.
  const [scene] = useState(() => scenes[Math.floor(Math.random() * scenes.length)]);
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={src({ scene, theme: "dark" })} />
      <img
        src={src({ scene, theme: "light" })}
        alt=""
        width={320}
        height={200}
        className="h-auto w-80 max-w-full"
      />
    </picture>
  );
}
