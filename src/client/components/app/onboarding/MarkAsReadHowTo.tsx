import { useEffect, useRef, useState, type RefObject } from "react";
import type { Entry } from "shared/feedsApi/types";
import { useT } from "client/i18n/useT";
import { Icon } from "client/components/primitives/icons/icons";
import { MosaicTileCard } from "client/components/feed/mosaic/MosaicTile";
import type { TileSlot } from "client/components/feed/mosaic/MosaicTile";
import { PullAction } from "client/components/feed/status/PullIndicator";
import { ReaderHeader } from "client/components/reader/article/ReaderHeader";
import { HowToDialog, HowToWay, HowToWays } from "client/components/app/onboarding/HowToDialog";
import { useElementWidth } from "client/hooks/useElementWidth";
import { layoutMasonry } from "client/utils/masonry";
import { textCardHeight } from "client/utils/textHeight";
import { displayShortcut } from "client/utils/tooltip";

interface MarkAsReadHowToProps {
  open: boolean;
  onClose: () => void;
  // The "See how" button: native focus return is not reliable on every engine (WebKit), so it is explicit.
  returnFocusRef: RefObject<HTMLElement | null>;
}

type Tab = "mosaic" | "reader";

// Matches the tile's leave transition, as the grid's own LEAVE_MS.
const LEAVE_MS = 200;
// The Reset button's touch height, held where the cards were.
const RESET_HEIGHT = 44;

interface Sample {
  entry: Entry;
  source: string;
}

interface SampleStoriesOptions {
  samples: readonly { source: string; title: string }[];
  turned: ReadonlySet<string>;
  published: number;
}

// Titles come from the locale on every render; only the turned set is state.
const sampleStories = ({ samples, turned, published }: SampleStoriesOptions): Sample[] =>
  samples.map(({ source, title }, index) => {
    const id = `sample-${index}`;
    return { entry: { id, feedId: "sample", title, published, unread: !turned.has(id) }, source };
  });

const ignore = (): void => undefined;

// The tile's mid-swipe hold, as the MosaicTile story shows it: the real card dragged past the commit
// line with the finger still down. Synthetic, so no pointer is captured, and the example is inert.
const SwipeExample = ({
  entry,
  source,
  width,
}: {
  entry: Entry;
  source: string;
  width: number | undefined;
}) => {
  const t = useT();
  const holdRef = useRef<HTMLDivElement>(null);
  const height =
    width === undefined
      ? 0
      : textCardHeight({ title: entry.title, untitled: t.articles.untitled, width });

  useEffect(() => {
    const card = holdRef.current?.querySelector<HTMLElement>("[data-preview]");
    if (!card || width === undefined) return;
    Object.defineProperty(card, "setPointerCapture", { value: ignore, configurable: true });
    const pointer = (type: string, clientX: number) => {
      card.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX, pointerId: 1, pointerType: "touch" }),
      );
    };
    pointer("pointerdown", 0);
    for (const step of [0.25, 0.5, 1]) pointer("pointermove", width * 0.5 * step);
  }, [width]);

  return (
    <div inert aria-hidden="true" className="relative w-full" style={{ height }}>
      <div ref={holdRef} className="absolute inset-0">
        {width === undefined ? null : (
          <MosaicTileCard
            entry={entry}
            originTitle={source}
            directOpen={false}
            slot={{ x: 0, y: 0, width, height }}
            tabIndex={0}
            onFocus={ignore}
            onKeyDown={ignore}
            onToggleRead={ignore}
            swipeable
          />
        )}
      </div>
    </div>
  );
};

// The reader's real header and its pull-up band, fed with a local sample. Inert: the header's
// links and buttons are only shown.
const ReaderExample = ({ entry, source }: { entry: Entry; source: string }) => (
  <div
    inert
    aria-hidden="true"
    className="relative flex min-h-96 flex-col overflow-hidden rounded-xl border border-hairline bg-surface-2"
  >
    <ReaderHeader
      entry={entry}
      minutes={0}
      openedUnread
      originTitle={source}
      onKeep={ignore}
      onMark={ignore}
    />
    <PullAction
      pull={{ edge: "bottom", distance: 56, armed: true, refreshing: false, released: false }}
      read
    />
  </div>
);

// The sample cards are the real tiles and masonry, fed with local entries: no query, no route,
// and nothing is written.
export const MarkAsReadHowTo = ({ open, onClose, returnFocusRef }: MarkAsReadHowToProps) => {
  const t = useT();
  const { howTo } = t.onboarding;
  const dialogRef = useRef<HTMLDialogElement>(null);
  // As in the grid, a card marked read goes through two states: `leaving`, fading out in its slot;
  // then `gone`, out of the layout until Reset.
  const [leaving, setLeaving] = useState<ReadonlyMap<string, TileSlot>>(() => new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const resetRef = useRef<HTMLButtonElement>(null);
  // Set when the card with focus is the last one left: the focus then goes to Reset, once it shows.
  const resetFocusPending = useRef(false);
  const [tab, setTab] = useState<Tab>("mosaic");
  const [published] = useState(Date.now);
  // Every opening starts unread on the Mosaic tab. The reset happens while rendering, not in the
  // effect below.
  const [shownOpen, setShownOpen] = useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setLeaving(new Map());
      setGone(new Set());
      setTab("mosaic");
    }
  }
  const turned = new Set([...gone, ...leaving.keys()]);
  const samples = sampleStories({ samples: howTo.samples, turned, published });
  const [firstSample] = howTo.samples;
  const example: Sample = {
    entry: { id: "example", feedId: "sample", title: firstSample.title, published, unread: true },
    source: firstSample.source,
  };
  const shown = samples.filter(({ entry }) => !gone.has(entry.id));
  const placed = samples.filter(({ entry }) => !turned.has(entry.id));
  const { attach, width } = useElementWidth();
  const layout =
    width === undefined
      ? undefined
      : layoutMasonry({
          containerWidth: width,
          items: placed.map(({ entry }) => ({
            id: entry.id,
            heightAt: (columnWidth: number) =>
              textCardHeight({
                title: entry.title,
                untitled: t.articles.untitled,
                width: columnWidth,
              }),
          })),
        });
  const focusSample = (id: string): void => {
    dialogRef.current?.querySelector<HTMLElement>(`[data-sample="${id}"] [tabindex="0"]`)?.focus();
  };
  const markRead = (id: string): void => {
    const slot = layout?.positions.get(id);
    if (!slot) return;
    const index = placed.findIndex(({ entry }) => entry.id === id);
    const next = placed.at(index + 1) ?? (index > 0 ? placed[index - 1] : undefined);
    const card = dialogRef.current?.querySelector(`[data-sample="${id}"]`);
    if (card?.contains(document.activeElement)) {
      if (next) focusSample(next.entry.id);
      else resetFocusPending.current = true;
    }
    setLeaving((prev) => new Map(prev).set(id, slot));
  };
  useEffect(() => {
    if (shown.length > 0 || !resetFocusPending.current) return;
    resetFocusPending.current = false;
    resetRef.current?.focus();
  }, [shown.length]);
  const reset = (): void => {
    setLeaving(new Map());
    setGone(new Set());
  };

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

  return (
    <HowToDialog
      open={open}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      dialogRef={dialogRef}
      title={howTo.title}
      closeLabel={howTo.close}
      tabsLabel={howTo.tabs.label}
      previousLabel={howTo.previous}
      nextLabel={howTo.next}
      tabs={[
        {
          id: "mosaic",
          label: howTo.tabs.mosaic,
          content: (
            <div className="flex flex-col gap-10">
              <div
                ref={attach}
                data-eased={gone.size > 0 ? "" : undefined}
                className="relative mx-auto w-full max-w-102 motion-safe:data-eased:transition-[height] motion-safe:data-eased:duration-350 motion-safe:data-eased:ease-[cubic-bezier(0.2,0.7,0.3,1)]"
                style={{ height: placed.length === 0 ? RESET_HEIGHT : (layout?.height ?? 0) }}
              >
                {layout
                  ? shown.map(({ entry, source }) => {
                      const slot = layout.positions.get(entry.id) ?? leaving.get(entry.id);
                      if (!slot) return null;
                      return (
                        <div key={entry.id} data-sample={entry.id} className="contents">
                          <MosaicTileCard
                            entry={entry}
                            originTitle={source}
                            directOpen={false}
                            slot={slot}
                            tabIndex={0}
                            onFocus={ignore}
                            onKeyDown={ignore}
                            onToggleRead={() => {
                              markRead(entry.id);
                            }}
                            swipeable={layout.columns === 1}
                            leavesWhenRead
                            leaving={leaving.has(entry.id)}
                          />
                        </div>
                      );
                    })
                  : null}
                {shown.length === 0 ? (
                  <div className="absolute inset-x-0 top-0 flex h-11 items-center justify-center">
                    <button
                      ref={resetRef}
                      type="button"
                      onClick={reset}
                      className="min-h-11 rounded-xl px-4 text-sm font-semibold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {howTo.reset}
                    </button>
                  </div>
                ) : null}
              </div>
              <HowToWays
                touch={
                  <HowToWay icon="touch">
                    <p>{howTo.touch}</p>
                    <SwipeExample entry={example.entry} source={example.source} width={width} />
                    <p className="text-sm">{howTo.swipeHint}</p>
                  </HowToWay>
                }
                mouse={
                  <HowToWay icon="mouse">
                    <p>
                      {howTo.mouseBefore} <span className="sr-only">{howTo.checkButton}</span>
                      <span
                        aria-hidden="true"
                        className="-my-1.5 inline-flex size-8 items-center justify-center rounded-full bg-surface/90 align-middle text-ink shadow-sm"
                      >
                        <Icon name="check" className="size-4" />
                      </span>{" "}
                      {howTo.mouseAfter}
                    </p>
                  </HowToWay>
                }
                keyboard={
                  <HowToWay icon="keyboard">
                    <p>
                      {howTo.keyboardBefore} <kbd>{displayShortcut("M")}</kbd>
                    </p>
                  </HowToWay>
                }
              />
            </div>
          ),
        },
        {
          id: "reader",
          label: howTo.tabs.reader,
          content: (
            <div className="flex flex-col gap-10">
              <ReaderExample entry={example.entry} source={example.source} />
              <HowToWays
                touch={
                  <HowToWay icon="touch">
                    <p>{howTo.readerTouch}</p>
                  </HowToWay>
                }
                mouse={
                  <HowToWay icon="mouse">
                    <p>
                      {howTo.readerMouseBefore}{" "}
                      <span className="sr-only">{t.articles.markReadAndClose}</span>
                      <span aria-hidden="true" className="-my-2.5 inline-flex align-middle">
                        <span className="reader-btn" data-accent="">
                          <Icon name="check" />
                        </span>
                      </span>{" "}
                      {howTo.readerMouseAfter}
                    </p>
                  </HowToWay>
                }
                keyboard={
                  <HowToWay icon="keyboard">
                    <p>
                      {howTo.readerKeyboardBefore} <kbd>{t.articles.escapeKey}</kbd>
                    </p>
                  </HowToWay>
                }
              />
            </div>
          ),
        },
      ]}
      tab={tab}
      onSelectTab={setTab}
    />
  );
};
