import { useState, useRef, type RefObject } from "react";
import type { Entry } from "shared/feedsApi/types";
import { useT } from "client/i18n/useT";
import { Switch } from "client/components/primitives/controls/Switch";
import { MosaicTileCard } from "client/components/feed/mosaic/MosaicTile";
import {
  HowToDialog,
  HowToWay,
  HowToWays,
  ignore,
} from "client/components/app/onboarding/HowToDialog";
import { useElementWidth } from "client/hooks/useElementWidth";
import { textCardHeight } from "client/utils/textHeight";
import { submitClassName } from "client/components/subscriptions/feeds/feedPanelButtons";

interface OriginalSiteHowToProps {
  open: boolean;
  onClose: () => void;
  // The "See how" button, as in MarkAsReadHowTo.
  returnFocusRef: RefObject<HTMLElement | null>;
}

type Tab = "setup" | "story";

// The per-feed switch of Subscriptions, real and local: it changes nothing but the example below.
// The tile is the real one in the stream, inert, and opens nothing, so the example cannot navigate.
export const OriginalSiteHowTo = ({ open, onClose, returnFocusRef }: OriginalSiteHowToProps) => {
  const t = useT();
  const { originalSiteHowTo, howTo } = t.onboarding;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("setup");
  const [directOpen, setDirectOpen] = useState(false);
  const [published] = useState(Date.now);
  // Every opening starts with the switch off, on the setup tab.
  const [shownOpen, setShownOpen] = useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setTab("setup");
      setDirectOpen(false);
    }
  }
  const [sample] = howTo.samples;
  const entry: Entry = {
    id: "example",
    feedId: "sample",
    title: sample.title,
    published,
    unread: true,
    url: "https://example.com/sample-one",
  };
  const { attach, width } = useElementWidth();
  const height =
    width === undefined
      ? 0
      : textCardHeight({ title: entry.title, untitled: t.articles.untitled, width });

  return (
    <HowToDialog
      open={open}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      dialogRef={dialogRef}
      title={originalSiteHowTo.title}
      closeLabel={howTo.close}
      tabsLabel={originalSiteHowTo.tabs.label}
      previousLabel={howTo.previous}
      nextLabel={howTo.next}
      tabs={[
        {
          id: "setup",
          label: originalSiteHowTo.tabs.setup,
          content: (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">{originalSiteHowTo.setup}</p>
              <div className="flex min-h-11 items-center rounded-xl border border-hairline px-3">
                <Switch
                  checked={directOpen}
                  onChange={setDirectOpen}
                  className="w-full justify-between"
                >
                  {t.subscriptions.opensOnSite}
                </Switch>
              </div>
              <p className="text-sm text-muted">{originalSiteHowTo.saveStep}</p>
              <div inert aria-hidden="true" className="flex">
                <button type="button" className={submitClassName}>
                  {t.subscriptions.saveChanges}
                </button>
              </div>
            </div>
          ),
        },
        {
          id: "story",
          label: originalSiteHowTo.tabs.story,
          content: (
            <div className="flex flex-col gap-10">
              <div
                inert
                aria-hidden="true"
                ref={attach}
                className="relative w-full"
                style={{ height }}
              >
                {width === undefined ? null : (
                  <div className="absolute inset-0">
                    <MosaicTileCard
                      entry={entry}
                      originTitle={sample.source}
                      directOpen={directOpen}
                      slot={{ x: 0, y: 0, width, height }}
                      tabIndex={0}
                      onFocus={ignore}
                      onKeyDown={ignore}
                      onToggleRead={ignore}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  {directOpen ? originalSiteHowTo.onNote : originalSiteHowTo.offNote}
                </p>
                <HowToWays
                  touch={
                    <HowToWay icon="touch">
                      <p>{originalSiteHowTo.touch}</p>
                    </HowToWay>
                  }
                  mouse={
                    <HowToWay icon="mouse">
                      <p>{originalSiteHowTo.mouse}</p>
                    </HowToWay>
                  }
                  keyboard={
                    <HowToWay icon="keyboard">
                      <p>
                        {originalSiteHowTo.keyboardBefore} <kbd>{originalSiteHowTo.enterKey}</kbd>
                      </p>
                    </HowToWay>
                  }
                />
              </div>
            </div>
          ),
        },
      ]}
      tab={tab}
      onSelectTab={setTab}
    />
  );
};
