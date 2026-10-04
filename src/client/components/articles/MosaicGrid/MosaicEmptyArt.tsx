import { useState } from "react";
import { useColorScheme } from "client/hooks/useColorScheme";
import { useSunPhase } from "client/hooks/useSunPhase";
import { useT } from "client/i18n/useT";
import { EMPTY_SCENES } from "./emptyScenes";
import type { EmptyScene } from "./emptyScenes";

type Phase = "day" | "dusk";

// Vite turns this template into a glob over the folder and bundles every match.
const src = ({ scene, phase }: { scene: EmptyScene; phase: Phase }): string =>
  new URL(
    `../../../assets/empty/${scene}-${phase === "day" ? "light" : "dark"}.webp`,
    import.meta.url,
  ).href;

const imageClassName =
  "col-start-1 row-start-1 h-auto w-80 max-w-full motion-safe:transition-opacity motion-safe:duration-300";

interface MosaicEmptyArtProps {
  scene?: EmptyScene;
  phase?: Phase;
}

export function MosaicEmptyArt({ scene: sceneProp, phase: phaseProp }: MosaicEmptyArtProps) {
  const t = useT().articles;
  // Picked once per mount, so a re-render does not swap the scene.
  const [picked] = useState(() => EMPTY_SCENES[Math.floor(Math.random() * EMPTY_SCENES.length)]);
  const scene = sceneProp ?? picked;
  const sunPhase = useSunPhase();
  const scheme = useColorScheme();
  const base: Phase = phaseProp ?? sunPhase ?? (scheme === "light" ? "day" : "dusk");

  const [override, setOverride] = useState<{ base: Phase; phase: Phase }>();
  // An override only holds for the base it was made on, so a sunrise or sunset clears it.
  if (override && override.base !== base) setOverride(undefined);
  const shown = override?.base === base ? override.phase : base;

  return (
    <button
      type="button"
      aria-label={shown === "day" ? t.showDuskScene : t.showDayScene}
      onClick={() => {
        setOverride({ base, phase: shown === "day" ? "dusk" : "day" });
      }}
      className="grid cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
    >
      {/* Decorative (alt=""): the button carries the label, and the text below says the list is empty. */}
      {(["day", "dusk"] as const).map((phase) => (
        <img
          key={phase}
          src={src({ scene, phase })}
          alt=""
          width={320}
          height={200}
          className={`${imageClassName} ${phase === shown ? "" : "opacity-0"}`}
        />
      ))}
    </button>
  );
}
