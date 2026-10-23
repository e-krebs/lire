import { useT } from "client/i18n/useT";

const DemoCard = ({ size, text = false }: { size: "o" | "s" | "m"; text?: boolean }) => (
  <div className={`landing-mc landing-mc--${size}${text ? " landing-mc--text" : ""}`}>
    {!text && <i className="landing-mc-image" />}
    <i className="landing-ti" />
    {text && <i className="landing-ti" />}
    <i className="landing-ti landing-ti--short" />
  </div>
);

export const FluidDemos = () => {
  const { shell } = useT();
  return (
    <section className="flex w-full max-w-160 flex-col items-center gap-3">
      <h2 className="text-center text-base text-balance">{shell.fluidResponsiveSmooth}</h2>
      <div className="landing-demos">
        <figure className="landing-demo">
          <div className="landing-stage landing-stage--reader" aria-hidden="true">
            <div className="landing-cols">
              <div className="landing-col">
                <DemoCard size="o" />
                <DemoCard size="s" text />
              </div>
              <div className="landing-col">
                <DemoCard size="m" />
                <DemoCard size="s" />
              </div>
            </div>
            <div className="landing-scrim" />
            <div className="landing-pn">
              <i className="landing-pn-title" />
              <i className="landing-pn-hero" />
              <i className="landing-pn-line" />
              <i className="landing-pn-line" />
              <i className="landing-pn-line landing-pn-line--short" />
              <i className="landing-pn-line" />
              <i className="landing-pn-line landing-pn-line--short" />
            </div>
          </div>
          <figcaption>{shell.demoReadCaption}</figcaption>
        </figure>
        <figure className="landing-demo">
          <div className="landing-stage landing-stage--swipe" aria-hidden="true">
            <div className="landing-panel" />
            <div className="landing-card">
              <i className="landing-card-title" />
              <i className="landing-card-line" />
            </div>
          </div>
          <figcaption>{shell.demoSwipeCaption}</figcaption>
        </figure>
        <figure className="landing-demo">
          <div className="landing-stage landing-stage--reorder" aria-hidden="true">
            <i className="landing-bar--a" />
            <i className="landing-bar--b" />
            <i />
          </div>
          <figcaption>{shell.demoReorderCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
};
