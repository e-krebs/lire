import badgeEn from "client/assets/google-play/badge-en.png";
import badgeFr from "client/assets/google-play/badge-fr.png";
import { useLocale } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { isAndroidBrowser, PLAY_STORE_URL } from "client/utils/androidApp";

export const AndroidBadge = () => {
  const { shell } = useT();
  const locale = useLocale();
  if (!isAndroidBrowser()) return null;
  return (
    <div className="flex w-full max-w-160 flex-col items-center gap-2">
      <p className="text-[0.9375rem] text-pretty text-muted">{shell.androidCopy}</p>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block focus-visible:outline-2 focus-visible:outline-accent"
      >
        <img
          src={locale === "fr" ? badgeFr : badgeEn}
          alt={shell.googlePlayBadge}
          width={646}
          height={250}
          className="h-auto max-w-full"
        />
      </a>
    </div>
  );
};
