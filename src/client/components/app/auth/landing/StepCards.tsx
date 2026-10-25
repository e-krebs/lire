import type { ReactNode } from "react";
import newsblurLogo from "client/assets/newsblur-logo.svg";
import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";

const NEWSBLUR_SIGNUP_URL = "https://newsblur.com/account/signup";

interface StepCardProps {
  number: number;
  title: string;
  body: string;
  figure: ReactNode;
  children?: ReactNode;
}

const StepCard = ({ number, title, body, figure, children }: StepCardProps) => (
  <li className="relative flex flex-col items-center gap-2 rounded-xl border border-hairline bg-card px-4 pt-6 pb-4 text-center text-sm">
    <span className="absolute -top-2.5 -left-1.5 grid size-6 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">
      {number}
    </span>
    {figure}
    <strong className="font-semibold text-ink">{title}</strong>
    <p className="m-0 max-w-[40ch] text-[0.8125rem] text-pretty text-muted">{body}</p>
    {children}
  </li>
);

const Arrow = () => (
  <li aria-hidden="true" className="grid place-items-center text-muted">
    <Icon name="chevron" className="rotate-90 sm:rotate-0" />
  </li>
);

export const StepCards = () => {
  const { shell } = useT();
  return (
    <section className="flex w-full max-w-176 flex-col gap-4">
      <h2 className="text-center text-base text-balance">{shell.howItWorks}</h2>
      <ol
        aria-label={shell.stepsAria}
        className="grid list-none gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]"
      >
        <StepCard
          number={1}
          title={shell.step1Title}
          body={shell.step1Body}
          figure={<img src={newsblurLogo} alt="" width={32} height={32} />}
        >
          <a
            href={NEWSBLUR_SIGNUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {shell.createNewsblurAccount}
            <Icon name="external" className="size-4 shrink-0" />
          </a>
        </StepCard>
        <Arrow />
        <StepCard
          number={2}
          title={shell.step2Title}
          body={shell.step2Body}
          figure={<Icon name="lire" className="size-8 text-ink" />}
        />
        <Arrow />
        <StepCard
          number={3}
          title={shell.step3Title}
          body={shell.step3Body}
          figure={<Icon name="refresh" className="size-8 text-ink" />}
        />
      </ol>
    </section>
  );
};
