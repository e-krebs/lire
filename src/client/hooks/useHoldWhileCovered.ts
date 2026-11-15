import { useEffect, useState } from "react";

// Below `lg` the list is hidden while the reader is open, and the reader closes through a view
// transition: a card turned read in there waits this long after the close before it leaves, so
// the leave plays on a list the eye can see.
const READER_SETTLE_MS = 300;

export const useHoldWhileCovered = ({ covered }: { covered: boolean }): boolean => {
  const [settling, setSettling] = useState(false);
  const [wasCovered, setWasCovered] = useState(covered);
  if (covered !== wasCovered) {
    setWasCovered(covered);
    if (!covered) setSettling(true);
  }
  // The pass that notices the uncovering still runs with the old `settling`, so it holds too.
  const holdLeave = covered || settling || covered !== wasCovered;
  useEffect(() => {
    if (!settling) return undefined;
    const timer = window.setTimeout(() => {
      setSettling(false);
    }, READER_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settling]);

  return holdLeave;
};
