import { Link } from "@tanstack/react-router";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";
import { panelSearch } from "client/utils/subscriptionsSearch";

// Opacity only, never `hidden`: Tab must still reach the link while it is faded out.
const editClassName = `
  absolute top-1/2 right-0 isolate flex size-10 flex-none -translate-y-1/2 cursor-pointer
  items-center justify-center rounded-full text-muted opacity-0
  after:absolute after:inset-1.5 after:-z-10 after:rounded-full
  hover:after:bg-hairline
  focus-visible:outline-2 focus-visible:outline-accent
  group-hover:opacity-100 group-focus-within:opacity-100 group-data-selected:opacity-100
  any-pointer-coarse:opacity-100
`;

interface EditLinkProps {
  target: Parameters<typeof panelSearch>[0];
  title: string;
  onClose: () => void;
}

export const EditLink = ({ target, title, onClose }: EditLinkProps) => {
  const t = useT().navigation;
  return (
    <Link
      to="/subscriptions"
      search={panelSearch(target)}
      onClick={onClose}
      {...tip({ label: t.edit({ label: title }) })}
      className={editClassName}
    >
      <Icon name="edit" className="size-4" />
    </Link>
  );
};
