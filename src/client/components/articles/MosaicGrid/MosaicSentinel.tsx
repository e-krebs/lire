interface MosaicSentinelProps {
  sentinelRef: (element: HTMLDivElement | null) => void;
}

export const MosaicSentinel = ({ sentinelRef }: MosaicSentinelProps) => (
  <div ref={sentinelRef} aria-hidden="true" className="h-px" />
);
