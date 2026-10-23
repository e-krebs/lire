import newsblurLogo from "client/assets/newsblur-logo.svg";
import { AndroidAppLink } from "client/components/app/android/AndroidAppLink";
import { LIBRARIES } from "client/components/app/credits/libraries";
import { BackLink } from "client/components/primitives/controls/BackLink";
import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";

const NEWSBLUR_URL = "https://newsblur.com";
const NEWSBLUR_LICENCE_URL = "https://github.com/samuelclay/NewsBlur/blob/master/LICENSE.md";
const LIRE_URL = "https://github.com/e-krebs/lire";
const LIRE_LICENCE_URL = "https://github.com/e-krebs/lire/blob/main/LICENSE";

const cardClassName = "mb-6 rounded-2xl border border-hairline bg-card p-5";
const paragraphClassName = "mb-2 max-w-[65ch] text-[0.9375rem] text-pretty";
const linkClassName =
  "text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent";
const linkRowClassName = "mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[0.9375rem]";

interface CreditsProps {
  signedOut: boolean;
}

export const Credits = ({ signedOut }: CreditsProps) => {
  const { shell } = useT();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-8">
        {signedOut && (
          <div className="mb-2">
            <BackLink>{shell.creditsBackToSignIn}</BackLink>
          </div>
        )}
        <h1 className="mb-6 text-2xl font-semibold text-ink">{shell.credits}</h1>

        <section className={cardClassName}>
          <div className="mb-3 flex items-center gap-3">
            <img src={newsblurLogo} alt="" width={40} height={40} className="size-10 flex-none" />
            <h2 className="text-base font-semibold text-ink">{shell.newsblurName}</h2>
          </div>
          <p className={paragraphClassName}>{shell.newsblurSource}</p>
          <p className={paragraphClassName}>
            {shell.newsblurHosts}
            <a
              href={NEWSBLUR_LICENCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              {shell.mitLicence}
            </a>
            {shell.newsblurLicenseAfter}
          </p>
          <div className={linkRowClassName}>
            <a
              href={NEWSBLUR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              {shell.visitNewsblur}
            </a>
          </div>
        </section>

        <section className={cardClassName}>
          <div className="mb-3 flex items-center gap-3">
            <Icon name="lire" className="size-10 flex-none" />
            <h2 className="text-base font-semibold text-ink">{shell.lireName}</h2>
          </div>
          <p className={paragraphClassName}>
            {shell.lireDescription}
            <a
              href={LIRE_LICENCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              {shell.mitLicence}
            </a>
            {shell.lireLicenseAfter}
          </p>
          <div className={linkRowClassName}>
            <a href={LIRE_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
              {shell.github}
            </a>
            <AndroidAppLink className="text-[0.9375rem]" />
          </div>
        </section>

        <section className={cardClassName}>
          <h2 className="text-base font-semibold text-ink">{shell.openSourceLibraries}</h2>
          <ul className="mt-3 list-none">
            {LIBRARIES.map((library) => (
              <li
                key={library.label}
                className="flex justify-between gap-4 border-t border-hairline py-1.5 text-[0.9375rem] first:border-t-0"
              >
                <span>{library.label}</span>
                <span className="text-[0.8125rem] text-faint">{library.license}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-center text-[0.8125rem] text-faint tabular-nums">
          {shell.creditsVersion({ version: import.meta.env.VITE_APP_VERSION ?? "dev" })}
        </p>
      </div>
    </div>
  );
};
