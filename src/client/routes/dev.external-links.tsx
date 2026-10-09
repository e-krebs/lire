import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { browserChoices, getPreferredBrowser, openExternal } from "client/utils/externalLinks";

// A manual check for each browser target from the installed app. Nothing in the UI links here, so
// it is reached by typing the URL.
const TEST_URL = "https://example.com/?from=lire-pwa-test";

const buttonClassName = `
  h-10 rounded-xl border border-hairline px-3 text-sm font-medium text-ink
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
`;

const linkClassName = "text-accent-text underline underline-offset-2";

export const Route = createFileRoute("/dev/external-links")({
  component: ExternalLinksTestPage,
});

function ExternalLinksTestPage() {
  const [choices] = useState(browserChoices);
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string): void => {
    setLog((lines) => [...lines, `${new Date().toLocaleTimeString()} ${line}`]);
  };

  useEffect(() => {
    const onVisibility = (): void => {
      setLog((lines) => [...lines, `visibility: ${document.visibilityState}`]);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 overflow-y-auto p-4 text-sm text-ink">
      <h1 className="text-lg font-semibold">External link test</h1>
      <p className="wrap-break-word text-muted">{navigator.userAgent}</p>
      <p>Saved choice: {getPreferredBrowser() ?? "n/a (not iOS or the Android app)"}</p>

      {choices.length === 0 ? (
        <p>No browser targets. Open this page from the installed iOS app or the Android app.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {choices.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={buttonClassName}
              onClick={() => {
                append(
                  `${label}: ${openExternal({ url: TEST_URL, browser: id }) ? "sent" : "not handled"}`,
                );
              }}
            >
              Open in {label}
            </button>
          ))}
        </div>
      )}

      <p>
        <a href={TEST_URL} target="_blank" rel="noopener" className={linkClassName}>
          Normal link
        </a>{" "}
        uses the choice from the account menu.
      </p>
      <p>
        <a
          href={TEST_URL}
          target="_blank"
          rel="noopener"
          data-open-in-app=""
          className={linkClassName}
        >
          Opt-out link
        </a>{" "}
        always opens in the app.
      </p>

      <pre className="rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap">
        {log.join("\n")}
      </pre>
    </div>
  );
}
