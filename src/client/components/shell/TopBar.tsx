import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import {
  Link,
  useCanGoBack,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { fromStreamKey } from "shared/feedsApi/streamKey";
import { useCollections, useProfile, useSubscriptions } from "client/api/queries";
import { AccountMenu } from "client/components/shell/AccountMenu";
import { Icon } from "client/components/ui/icons";
import { LocationBar } from "client/components/navigation/LocationBar";
import { Navigator } from "client/components/navigation/Navigator";
import type { NavigatorPanelHandle } from "client/components/navigation/Navigator";
import { ViewToggles, ViewTogglesSkeleton } from "client/components/navigation/ViewToggles";
import { tip } from "client/utils/tooltip";
import { useActiveOverlay } from "client/hooks/useOverlay";
import { streamLabel } from "client/utils/streamLabel";
import type { StreamLabel } from "client/utils/streamLabel";
import { panelSearch } from "client/utils/subscriptionsSearch";
import { isGlobalUncategorizedStreamId, isReadStreamId } from "shared/feedsApi/streams";

// "Category › Feed" for a feed, the plain name otherwise.
const scopeLabelOf = (named: StreamLabel): string =>
  named.parent ? `${named.parent} › ${named.label}` : named.label;

const iconButtonClassName = `
  inline-flex size-10 flex-none items-center justify-center rounded-full text-muted
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
`;

// One sticky bar for every tier: the location bar opens the Navigator, the actions stay put on
// the right. Under `bar-bottom:` the whole bar flips to the bottom edge — row 2 of the shell
// grid, the hairline and the safe-area padding with it. Route state is read loosely because the
// bar lives above the route tree — and it is the only source of truth here: the stream is the
// chip, `q` is the article search text. The bar owns nothing but whether the panel is open and
// the text being typed into it.
export const TopBar = () => {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const location = useLocation();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const collections = useCollections();
  const subscriptions = useSubscriptions();
  const profile = useProfile();
  // Behind an open panel only that panel's own items stay live (LocationBar handles its pill).
  const activeOverlay = useActiveOverlay();
  const anyOverlay = activeOverlay !== null || undefined;
  const menuInert = (activeOverlay !== null && activeOverlay !== "account-menu") || undefined;
  const streamKey = params.streamKey;
  const onSubscriptions = location.pathname === "/subscriptions";
  const articleQuery = typeof search.q === "string" ? search.q : undefined;
  const [panelOpen, setPanelOpen] = useState(false);
  // The typed text. A navigation that changes `q` replaces it (react.dev's "adjusting state when
  // a prop changes" pattern); opening, closing or Escape leave it alone.
  const [draft, setDraft] = useState(articleQuery ?? "");
  const [lastQuery, setLastQuery] = useState(articleQuery);
  if (articleQuery !== lastQuery) {
    setLastQuery(articleQuery);
    setDraft(articleQuery ?? "");
  }
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelHandleRef = useRef<NavigatorPanelHandle>(null);

  // Off a stream route (Subscriptions) the bar still names the widest scope.
  const scopeKey = streamKey ?? "all";
  const userId = profile.data?.id;
  // The key carries no user id, so the full stream id waits on the profile.
  const scopeStreamId = userId === undefined ? undefined : fromStreamKey({ key: scopeKey, userId });
  const named =
    scopeStreamId === undefined
      ? undefined
      : streamLabel({
          streamId: scopeStreamId,
          collections: collections.data,
          subscriptions: subscriptions.data,
        });
  // Until then the key is the best name at hand — for a category it usually *is* the label.
  const scopeLabel = named === undefined ? scopeKey : scopeLabelOf(named);
  // Global Uncategorized has no Subscriptions panel to open.
  const edit =
    scopeStreamId === undefined || named === undefined
      ? undefined
      : named.kind === "feed"
        ? { search: panelSearch({ kind: "feed", feedId: scopeStreamId }), label: named.label }
        : named.kind === "category" && !isGlobalUncategorizedStreamId(scopeStreamId)
          ? {
              search: panelSearch({ kind: "category", categoryId: scopeStreamId }),
              label: named.label,
            }
          : undefined;
  const clearable = scopeKey !== "all";

  const openPanel = (): void => {
    setPanelOpen(true);
  };
  const closePanel = (): void => {
    setPanelOpen(false);
  };
  const focusInput = (): void => {
    inputRef.current?.focus();
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    panelHandleRef.current?.handleKeyDown(event);
  };

  // Widening the scope is a navigation, not a bar state: everything else (q, unread, ranked)
  // rides along.
  const clearScope = (): void => {
    void navigate({
      to: "/stream/$streamKey",
      params: { streamKey: "all" },
      search: (prev) => prev,
    });
  };

  // Clearing is an interaction with the field, so it opens the panel like a click on it.
  const clearText = (): void => {
    focusInput();
    setPanelOpen(true);
    setDraft("");
    if (articleQuery !== undefined) {
      void navigate({
        to: "/stream/$streamKey",
        params: { streamKey: scopeKey },
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
  };

  const goBack = (): void => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/" });
  };

  return (
    <header
      className={`
        sticky top-0 z-20 flex min-w-0 items-center gap-2 border-b border-hairline bg-surface/90
        py-2 pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]
        pr-[calc(--spacing(3)+env(safe-area-inset-right,0px))]
        pl-[calc(--spacing(3)+env(safe-area-inset-left,0px))] backdrop-blur
        bar-bottom:top-auto bar-bottom:bottom-0 bar-bottom:row-start-2
        bar-bottom:border-t bar-bottom:border-b-0
        bar-bottom:pt-2 bar-bottom:pb-[calc(--spacing(2)+env(safe-area-inset-bottom,0px))]
      `}
    >
      {onSubscriptions ? (
        <>
          {/* Both edge groups take an equal share of the free space, which centres the title on
              the bar itself rather than on the gap between the two unequal groups. */}
          <div className="flex min-w-0 flex-1 basis-0 items-center">
            <button
              type="button"
              onClick={goBack}
              inert={anyOverlay}
              aria-label="Go back"
              className={`
                -ml-1 inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full pr-3.5 pl-2.5
                text-sm font-medium text-muted
                hover:bg-surface-2
                focus-visible:outline-2 focus-visible:outline-accent
              `}
            >
              <Icon name="back" className="size-5 flex-none" />
              <span className="truncate">Back</span>
            </button>
          </div>
          <h1 inert={anyOverlay} className="min-w-0 truncate text-base font-semibold text-ink">
            Subscriptions
          </h1>
        </>
      ) : (
        <>
          <Link
            to="/"
            inert={anyOverlay}
            {...tip({ label: "Lire home" })}
            className={`${iconButtonClassName} -ml-1 text-ink`}
          >
            <Icon name="lire" className="size-6.5" />
          </Link>
          <LocationBar
            ref={barRef}
            onOpen={openPanel}
            draft={draft}
            onDraftChange={setDraft}
            onSearchKeyDown={handleSearchKeyDown}
            inputRef={inputRef}
            clearable={clearable}
            scopeLabel={scopeLabel}
            onClearScope={clearScope}
            onClearText={clearText}
            edit={edit}
            viewControls={
              // The recently-read stream is read entries, newest first: nothing to filter or sort.
              streamKey === undefined || streamKey === "read" ? undefined : scopeStreamId ===
                undefined ? (
                <ViewTogglesSkeleton />
              ) : isReadStreamId(scopeStreamId) ? undefined : (
                <ViewToggles streamId={scopeStreamId} search={search} />
              )
            }
          />
          <Navigator
            open={panelOpen}
            onClose={closePanel}
            onRequestFocus={focusInput}
            query={draft}
            onQueryChange={setDraft}
            anchorRef={barRef}
            panelHandleRef={panelHandleRef}
            clearable={clearable}
            scopeKey={scopeKey}
            scopeLabel={scopeLabel}
            onClearScope={clearScope}
            onClearText={clearText}
          />
        </>
      )}
      {/* Never inert under the account menu: the popover is a DOM child of this wrapper. */}
      <div
        inert={menuInert}
        className={`-mr-1 flex items-center gap-2 ${
          onSubscriptions ? "min-w-0 flex-1 basis-0 justify-end" : "flex-none"
        }`}
      >
        <AccountMenu />
      </div>
    </header>
  );
};
