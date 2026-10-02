// The glyphs live in public/icons.svg, a plain sprite the browser fetches and caches on its own.
/** @public Used by stories only. */
export const ICON_NAMES = [
  "settings",
  "lire",
  "unread-only",
  "everything",
  "sort-newest",
  "sort-oldest",
  "search",
  "back",
  "close",
  "chevron",
  "history",
  "check",
  "external",
  "refresh",
  "edit",
  "image-off",
  "undo",
  "grip",
] as const;

type IconName = (typeof ICON_NAMES)[number];

interface IconProps {
  name: IconName;
  className?: string;
}

export const Icon = ({ name, className }: IconProps) => (
  <svg width={22} height={22} className={className} aria-hidden="true">
    <use href={`${import.meta.env.BASE_URL}icons.svg#${name}`} />
  </svg>
);
