import type { ReactNode } from "react";
import { TooltipLayer } from "client/components/shell/TooltipLayer";
import { TopBar } from "client/components/shell/TopBar";
import { useOverlayOpen } from "client/hooks/useOverlay";

interface AppShellProps {
  children: ReactNode;
}

// One layout for every tier: a sticky top bar with collection pills, the content below — or,
// under `bar-bottom:`, the rows swap and the bar takes row 2 (from inside TopBar), leaving the
// DOM order header → main. No sidebar, no bottom nav. `Panes` splits the content into mosaic
// and reader at `lg`.
export const AppShell = ({ children }: AppShellProps) => {
  // A menu or the desktop Navigator is open: the content behind it neither hovers nor clicks.
  const overlayOpen = useOverlayOpen();
  return (
    <div
      className={`
      grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-canvas text-ink
      bar-bottom:grid-rows-[minmax(0,1fr)_auto]
    `}
    >
      <a
        href="#main"
        inert={overlayOpen || undefined}
        className={`
        sr-only
        focus:not-sr-only
        focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50
        focus-visible:rounded-md focus-visible:bg-surface focus-visible:px-3 focus-visible:py-2
        focus-visible:outline-2 focus-visible:outline-accent
      `}
      >
        Skip to content
      </a>
      <TopBar />
      <main
        id="main"
        tabIndex={-1}
        inert={overlayOpen || undefined}
        className="min-h-0 min-w-0 pr-safe pl-safe bar-bottom:row-start-1"
      >
        {children}
      </main>
      <TooltipLayer />
    </div>
  );
};

interface PanesProps {
  list: ReactNode;
  reader: ReactNode | null;
}

// Below `lg` one pane shows: the reader when an entry is open, the list otherwise. At `lg`+ the
// grid keeps the full width and the reader floats over it — the reader brings its own scrim and
// panel (see Reader.tsx), which this container is only the positioning context for.
export const Panes = ({ list, reader }: PanesProps) => (
  <div
    data-reading={reader ? "" : undefined}
    className="panes group relative grid h-full min-h-0 grid-cols-1"
  >
    <section
      aria-label="Entries"
      // Behind the scrim the grid is out of reach for the keyboard and the reader as well.
      inert={reader ? true : undefined}
      className={`
        min-h-0 scroll-pane
        group-data-reading:hidden
        lg:group-data-reading:block
      `}
    >
      {list}
    </section>
    {reader}
  </div>
);
