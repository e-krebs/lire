import { useEffect, useState } from "react";
import type { TileSlot } from "client/components/feed/mosaic/MosaicTile";

// Matches the leave transition of the tile.
const LEAVE_MS = 200;

export const useLeavingTiles = () => {
  const [leaving, setLeaving] = useState<ReadonlyMap<string, TileSlot>>(() => new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (leaving.size === 0) return undefined;
    const timer = window.setTimeout(() => {
      setGone((prev) => new Set([...prev, ...leaving.keys()]));
      setLeaving(new Map());
    }, LEAVE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [leaving]);

  const leave = ({ slots }: { slots: ReadonlyMap<string, TileSlot> }): void => {
    setLeaving((prev) => new Map([...prev, ...slots]));
  };
  const remove = ({ ids }: { ids: ReadonlySet<string> }): void => {
    setGone((prev) => new Set([...prev, ...ids]));
  };
  const revive = ({ ids }: { ids: ReadonlySet<string> }): void => {
    setLeaving((prev) => new Map([...prev].filter(([id]) => !ids.has(id))));
    setGone((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  };
  const reset = (): void => {
    setLeaving(new Map());
    setGone(new Set());
  };

  return { leaving, gone, leave, remove, revive, reset };
};
