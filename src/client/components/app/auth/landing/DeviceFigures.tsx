import { useState } from "react";
import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";
import { isInstalledApp, useInstallPrompt } from "client/utils/installPrompt";

type DeviceKind = "desktop" | "tablet" | "phone";

interface MockCardSpec {
  size: "o" | "s" | "m";
  text?: boolean;
}

const DEVICE_COLUMNS: Record<DeviceKind, MockCardSpec[][]> = {
  desktop: [
    [{ size: "o" }, { size: "s", text: true }],
    [{ size: "m" }, { size: "s" }],
    [{ size: "s", text: true }, { size: "o" }],
  ],
  tablet: [
    [{ size: "o" }, { size: "s", text: true }, { size: "s" }],
    [{ size: "m" }, { size: "s" }, { size: "s", text: true }],
  ],
  phone: [[{ size: "o" }, { size: "s", text: true }, { size: "s" }]],
};

const MockCard = ({ size, text = false }: MockCardSpec) => (
  <div className={`landing-mc landing-mc--${size}${text ? " landing-mc--text" : ""}`}>
    {!text && <i className="landing-mc-image" />}
    <i className="landing-ti" />
    {text && <i className="landing-ti" />}
    <i className="landing-ti landing-ti--short" />
  </div>
);

interface DeviceFigureProps {
  kind: DeviceKind;
  caption: string;
}

const DeviceFigure = ({ kind, caption }: DeviceFigureProps) => (
  <figure className="landing-dev">
    <div className={`landing-scr landing-scr--${kind}`} aria-hidden="true">
      <div className="landing-tb">
        <i className="landing-tb-logo" />
        <div className="landing-tb-search">
          <i />
          <i />
        </div>
        <i className="landing-tb-avatar" />
      </div>
      <div className="landing-pane">
        <div className="landing-cols">
          {DEVICE_COLUMNS[kind].map((cards, column) => (
            <div className="landing-col" key={column}>
              {cards.map((card, index) => (
                <MockCard key={index} {...card} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
    <figcaption>{caption}</figcaption>
  </figure>
);

// The same box in both states, so the line never moves: only the button adds colour and interaction.
const installLineClassName = "flex items-center gap-1.5 rounded-sm text-left";
const installButtonClassName =
  "text-accent-text underline-offset-2 enabled:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:cursor-default disabled:text-muted";

const InstallCopy = ({ text }: { text: string }) => (
  <>
    <Icon name="install" className="size-4.5 shrink-0" />
    <span>{text}</span>
  </>
);

export const DeviceFigures = () => {
  const { shell } = useT();
  const { canInstall, installed, install } = useInstallPrompt();
  // Once offered, the line stays a button: after the prompt is spent it is disabled, not swapped out.
  // Only an install in this tab swaps it for text, and the box stays the same.
  const installable = canInstall && !isInstalledApp();
  const [offered, setOffered] = useState(installable);
  if (installable && !offered) setOffered(true);
  const showButton = offered && !installed && !isInstalledApp();
  return (
    <section className="flex w-full max-w-160 flex-col items-center gap-3">
      <h2 className="text-center text-base text-balance">{shell.worksAcrossDevices}</h2>
      <div className="landing-devices">
        <DeviceFigure kind="desktop" caption={shell.desktop} />
        <DeviceFigure kind="tablet" caption={shell.tablet} />
        <DeviceFigure kind="phone" caption={shell.phone} />
      </div>
      <p className="flex max-w-[60ch] items-center gap-1.5 text-[0.9375rem] text-pretty text-muted">
        {showButton ? (
          <button
            type="button"
            disabled={!canInstall}
            onClick={() => void install()}
            className={`${installLineClassName} ${installButtonClassName}`}
          >
            <InstallCopy text={shell.installCopy} />
          </button>
        ) : (
          <span className={installLineClassName}>
            <InstallCopy text={shell.installCopy} />
          </span>
        )}
      </p>
    </section>
  );
};
