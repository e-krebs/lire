import { useT } from "client/i18n/useT";
import { DIRECT_OPEN_STORAGE_KEY } from "client/api/queries";
import { STORAGE_KEY as BAR_POSITION_STORAGE_KEY } from "client/hooks/utils/barPosition";
import { STORAGE_KEY as READER_WIDTH_STORAGE_KEY } from "client/hooks/useResizablePanel";

const forget = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Blocked storage: nothing was kept.
  }
};

const reset = async (): Promise<void> => {
  const { resetFixtureState } = await import("client/api/adapters/fixture");
  resetFixtureState();
  forget(DIRECT_OPEN_STORAGE_KEY);
  forget(BAR_POSITION_STORAGE_KEY);
  forget(READER_WIDTH_STORAGE_KEY);
  window.location.assign("/");
};

export const DemoBanner = () => {
  const { shell } = useT();
  return (
    <p
      role="status"
      className="flex items-center gap-3 bg-accent-soft px-3 py-2 text-sm text-accent-text"
    >
      {shell.demoNotice}
      <button
        type="button"
        onClick={() => void reset()}
        className={`
        rounded-full bg-surface-2 px-3 py-1 font-medium text-ink
        hover:bg-hairline
        focus-visible:outline-2 focus-visible:outline-accent
      `}
      >
        {shell.reset}
      </button>
    </p>
  );
};
