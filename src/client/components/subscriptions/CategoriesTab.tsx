import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useRef, useState } from "react";
import {
  unreadCountFor,
  useCreateCollection,
  usePreferences,
  useReorderCategories,
  useSavingPreferences,
  useUnreadCounts,
} from "client/api/queries";
import { Icon } from "client/components/ui/icons";
import type { Collection } from "shared/feedsApi/types";
import {
  EmptyLine,
  feedCountLabel,
  FilterRow,
  addButtonClassName,
  listRowClassName,
  matchesFilter,
} from "./FeedsTab";
import { markPanelOrigin } from "./SidePanel";

const inputClassName = `
  min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline ring-inset
  focus-visible:outline-2 focus-visible:outline-accent
  aria-invalid:ring-danger
`;

const textButtonClassName = `
  min-h-11 flex-none rounded-full px-4 text-sm font-medium
  focus-visible:outline-2 focus-visible:outline-accent
  disabled:opacity-50
`;

interface NewCategoryFormProps {
  onCancel: () => void;
  onCreated: (categoryId: string) => void;
}

// Asks for the name in place, and keeps the draft on blur: only Cancel or Escape drops it.
const NewCategoryForm = ({ onCancel, onCreated }: NewCategoryFormProps) => {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [empty, setEmpty] = useState(false);
  const createCollection = useCreateCollection();

  const errorMessage = empty
    ? "Enter a name for the category."
    : createCollection.isError
      ? `Could not create that category. ${createCollection.error.message}`
      : null;

  return (
    <form
      className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-hairline ring-inset"
      onSubmit={(event) => {
        event.preventDefault();
        const label = name.trim();
        if (label === "") {
          setEmpty(true);
          inputRef.current?.focus();
          return;
        }
        createCollection.mutate(label, {
          onSuccess: (collection) => {
            onCreated(collection.id);
          },
        });
      }}
    >
      <label htmlFor={inputId} className="text-xs font-semibold text-muted">
        New category name
      </label>
      <input
        ref={inputRef}
        id={inputId}
        autoFocus
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        aria-invalid={errorMessage !== null || undefined}
        aria-describedby={errorMessage === null ? undefined : errorId}
        onChange={(event) => {
          setName(event.target.value);
          setEmpty(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className={inputClassName}
      />
      {errorMessage === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`${textButtonClassName} text-muted hover:bg-surface-2`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createCollection.isPending}
          className={`${textButtonClassName} bg-accent font-semibold text-on-accent`}
        >
          Create category
        </button>
      </div>
    </form>
  );
};

const byIds = ({ collections, ids }: { collections: Collection[]; ids: string[] }) => {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...collections].sort(
    (a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length),
  );
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface CategoryRowProps {
  collection: Collection;
  unread: number;
  selected: boolean;
  sortable: boolean;
  saving: boolean;
  onOpen: (categoryId: string) => void;
}

const CategoryRow = ({
  collection,
  unread,
  selected,
  sortable,
  saving,
  onOpen,
}: CategoryRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: collection.id, disabled: !sortable || saving });
  const feedCount = collection.feeds.length;
  const detailId = useId();
  const unreadId = useId();

  return (
    <li
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`
        relative flex items-center rounded-xl motion-reduce:transition-none!
        data-dragging:z-10 data-dragging:bg-surface data-dragging:shadow-lg
      `}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${collection.label}`}
          className={`
            grid size-11 flex-none cursor-grab touch-none place-items-center rounded-xl text-faint
            hover:text-muted
            focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent
            active:cursor-grabbing
            aria-disabled:cursor-default
          `}
        >
          <Icon name="grip" className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        data-selected={selected || undefined}
        aria-current={selected || undefined}
        aria-label={collection.label}
        aria-describedby={`${detailId} ${unreadId}`}
        onClick={(event) => {
          markPanelOrigin(event.currentTarget);
          onOpen(collection.id);
        }}
        className={`${listRowClassName} min-w-0`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            data-tip={collection.label}
            data-tip-overflow=""
            className="morph-name max-w-full self-start truncate text-sm font-medium text-ink"
          >
            {collection.label}
          </span>
          <span id={detailId} className="morph-detail self-start text-xs text-faint tabular-nums">
            {feedCountLabel(feedCount)}
          </span>
        </span>
        <span
          id={unreadId}
          className={`
            flex-none rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold
            text-muted tabular-nums
          `}
        >
          {unread}
          <span className="sr-only"> unread</span>
        </span>
        <Icon name="chevron" className="size-4 flex-none text-faint" />
      </button>
    </li>
  );
};

interface CategoriesTabProps {
  collections: Collection[];
  /** Category whose panel is open, if any. */
  openCategoryId: string | undefined;
  /** Category row clicked. */
  onOpenCategory: (categoryId: string) => void;
}

export const CategoriesTab = ({
  collections,
  openCategoryId,
  onOpenCategory,
}: CategoriesTabProps) => {
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  // dnd-kit clears the drag transforms on drop, so the list must take the new order in that same render.
  const [droppedIds, setDroppedIds] = useState<string[] | null>(null);
  const unreadCounts = useUnreadCounts();
  const preferences = usePreferences();
  const reorder = useReorderCategories();
  // Read from the mutation cache, so a save started before a tab switch still holds the handles.
  const saving = useSavingPreferences();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = droppedIds === null ? collections : byIds({ collections, ids: droppedIds });
  const shown = ordered.filter((collection) =>
    matchesFilter({ filter, texts: [collection.label] }),
  );
  // Before preferences load, a drop would write the API order over the stored one.
  const sortable = preferences.data !== undefined && shown.length === collections.length;

  const labelOf = (id: UniqueIdentifier): string =>
    ordered.find((collection) => collection.id === id)?.label ?? "";
  const positionOf = (id: UniqueIdentifier): string =>
    `position ${ordered.findIndex((collection) => collection.id === id) + 1} of ${ordered.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, at ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${labelOf(active.id)} moved to ${positionOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${labelOf(active.id)} dropped at ${positionOf(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `Move cancelled. ${labelOf(active.id)} stays in place.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id || saving) return;
    const ids = ordered.map((collection) => collection.id);
    const categoryIds = arrayMove(
      ids,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setDroppedIds(categoryIds);
    // By settle time the cache holds the saved order, or the rollback on a failure.
    void reorder
      .mutateAsync({ categoryIds })
      .catch(() => undefined)
      .finally(() => {
        setDroppedIds(null);
      });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FilterRow
          label="Filter categories"
          placeholder="Filter categories…"
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          aria-expanded={creating}
          onClick={() => {
            setCreating(true);
          }}
          className={addButtonClassName}
        >
          ＋ New
        </button>
      </div>
      {creating ? (
        <NewCategoryForm
          onCancel={() => {
            setCreating(false);
          }}
          onCreated={(categoryId) => {
            setCreating(false);
            markPanelOrigin(null);
            onOpenCategory(categoryId);
          }}
        />
      ) : null}
      {collections.length === 0 ? (
        <EmptyLine>Categories group your feeds. Create one with “＋ New”.</EmptyLine>
      ) : shown.length === 0 ? (
        <EmptyLine>{`No category matches “${filter.trim()}”`}</EmptyLine>
      ) : (
        <>
          {reorder.isError ? (
            <p role="alert" className="text-sm text-danger">
              Could not save the new order. Move the category again to retry.
            </p>
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalOnly]}
            accessibility={{ announcements }}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={shown.map((collection) => collection.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col">
                {shown.map((collection) => (
                  <CategoryRow
                    key={collection.id}
                    collection={collection}
                    unread={unreadCountFor({ counts: unreadCounts.data, id: collection.id })}
                    selected={collection.id === openCategoryId}
                    sortable={sortable}
                    saving={saving}
                    onOpen={onOpenCategory}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
};
