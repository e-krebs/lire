import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";
import { isAndroidBrowser, PLAY_STORE_URL } from "client/utils/androidApp";

interface AndroidAppLinkProps {
  className?: string;
}

export const AndroidAppLink = ({ className }: AndroidAppLinkProps) => {
  const { shell } = useT();
  if (!isAndroidBrowser()) return null;
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-accent ${className ?? ""}`}
    >
      {shell.getAndroidApp}
      <Icon name="external" className="size-4 shrink-0" />
    </a>
  );
};
