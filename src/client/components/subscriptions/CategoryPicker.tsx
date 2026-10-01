import { useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "client/components/ui/icons";

interface CategoryOption {
  id: string;
  label: string;
}

interface CategoryPickerProps {
  /** Options to list. */
  categories: readonly CategoryOption[];
  /** Ids of the ticked options. */
  selected: readonly string[];
  /** Selection changed, with the full new set of ids. */
  onChange: (selected: string[]) => void;
  /** `multiple` is a feed's category set, `single` a target (the delete's orphans, a new feed). */
  mode: "multiple" | "single";
  /** Ids left out of the list. */
  exclude?: readonly string[];
  /** Offered as `Create “<text>”` once the filter matches nothing. */
  onCreate?: (name: string) => void;
}

interface RowProps {
  option: CategoryOption;
  checked: boolean;
  mode: CategoryPickerProps["mode"];
  name: string;
  onToggle: (toggled: { id: string; checked: boolean }) => void;
}

const rowClassName = `
  flex min-h-11 items-center gap-3 border-b border-hairline px-3 text-sm text-ink
  last:border-b-0
  has-checked:bg-accent-soft
`;

const Row = ({ option, checked, mode, name, onToggle }: RowProps) => (
  <label className={rowClassName}>
    <input
      type={mode === "single" ? "radio" : "checkbox"}
      name={name}
      checked={checked}
      onChange={(event) => {
        onToggle({ id: option.id, checked: event.target.checked });
      }}
      className="size-5 flex-none accent-accent focus-visible:outline-2 focus-visible:outline-accent"
    />
    <span data-tip={option.label} data-tip-overflow="" className="min-w-0 flex-1 truncate">
      {option.label}
    </span>
  </label>
);

interface OptionRowsProps {
  options: readonly CategoryOption[];
  selected: readonly string[];
  mode: CategoryPickerProps["mode"];
  name: string;
  onToggle: RowProps["onToggle"];
}

const OptionRows = ({ options, selected, mode, name, onToggle }: OptionRowsProps) =>
  options.map((option) => (
    <Row
      key={option.id}
      option={option}
      checked={selected.includes(option.id)}
      mode={mode}
      name={name}
      onToggle={onToggle}
    />
  ));

// The selected entries sit on top and the rest scroll under a fade, so the height holds whether
// the account keeps 20 categories or 200.
export const CategoryPicker = ({
  categories,
  selected,
  onChange,
  mode,
  exclude = [],
  onCreate,
}: CategoryPickerProps) => {
  const headingId = useId();
  const name = useId();
  const [filter, setFilter] = useState("");
  // Pinned from the selection on mount, so a row never jumps away from the pointer that ticked
  // it. The caller remounts the picker (a `key`) when it switches to another feed.
  const [pinned] = useState(() => new Set(selected));
  const listRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const options = categories.filter((category) => !exclude.includes(category.id));
  const needle = filter.trim().toLocaleLowerCase();
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
  const top = matches.filter((option) => pinned.has(option.id));
  const rest = matches.filter((option) => !pinned.has(option.id));
  const selectedCount = options.filter((option) => selected.includes(option.id)).length;

  // The fade hints at hidden rows, so it goes once the list fits or reaches its end.
  const measure = (): void => {
    const list = listRef.current;
    setMoreBelow(list !== null && list.scrollHeight - list.scrollTop - list.clientHeight > 1);
  };
  useLayoutEffect(measure, [rest.length]);
  // A picker inside a closed <dialog> mounts with no height, so it measures again once shown.
  const observeList = (list: HTMLDivElement | null) => {
    listRef.current = list;
    const observer =
      list && typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
    if (list) observer?.observe(list);
    return () => {
      observer?.disconnect();
    };
  };

  const toggle = ({ id, checked }: { id: string; checked: boolean }): void => {
    if (mode === "single") onChange([id]);
    else onChange(checked ? [...selected, id] : selected.filter((entry) => entry !== id));
  };

  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-xs font-semibold text-muted tabular-nums">
        {`Categories · ${selectedCount} of ${options.length}`}
      </h3>
      <div className="overflow-hidden rounded-xl ring-1 ring-hairline ring-inset">
        <div
          className={`
            flex min-h-11 items-center gap-2 rounded-t-xl border-b border-hairline px-3
            focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent
          `}
        >
          <Icon name="search" className="size-4 flex-none text-faint" />
          <input
            type="search"
            aria-label="Filter categories"
            placeholder={`Filter ${options.length} categories…`}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
            className={`
              min-w-0 flex-1 bg-transparent text-sm text-ink outline-none
              placeholder:text-faint
              [&::-webkit-search-cancel-button]:appearance-none
            `}
          />
        </div>
        {top.length === 0 ? null : (
          <div
            data-has-rest={rest.length > 0 || undefined}
            className="border-hairline data-has-rest:border-b"
          >
            <OptionRows
              options={top}
              selected={selected}
              mode={mode}
              name={name}
              onToggle={toggle}
            />
          </div>
        )}
        {matches.length === 0 ? (
          needle !== "" && onCreate ? (
            <button
              type="button"
              onClick={() => {
                onCreate(filter.trim());
                setFilter("");
              }}
              className={`
                flex min-h-11 w-full items-center rounded-b-xl px-3 text-left text-sm font-medium
                text-accent-text
                hover:bg-surface-2
                focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent
              `}
            >
              <span className="truncate">{`Create “${filter.trim()}”`}</span>
            </button>
          ) : (
            <p className="flex min-h-11 items-center px-3 text-sm text-faint">
              {needle === "" ? "No category yet" : `No category matches “${filter.trim()}”`}
            </p>
          )
        ) : null}
        {rest.length === 0 ? null : (
          <div className="relative">
            <div ref={observeList} onScroll={measure} className="max-h-52 overflow-y-auto">
              <OptionRows
                options={rest}
                selected={selected}
                mode={mode}
                name={name}
                onToggle={toggle}
              />
            </div>
            {moreBelow ? (
              <div
                aria-hidden="true"
                className={`
                  pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-b
                  from-transparent to-surface
                `}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
