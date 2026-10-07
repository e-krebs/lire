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
  useCreateCategory,
  usePreferences,
  useReorderCategories,
  useSavingPreferences,
  useCounts,
} from "client/api/queries";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { toStreamKey } from "shared/feedsApi/streamKey";
import type { Category } from "shared/feedsApi/types";
import {
  EmptyLine,
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
  categories: Category[];
  onCancel: () => void;
  onCreated: (categoryId: string) => void;
}

// Asks for the name in place, and keeps the draft on blur: only Cancel or Escape drops it.
const NewCategoryForm = ({ categories, onCancel, onCreated }: NewCategoryFormProps) => {
  const t = useT();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [empty, setEmpty] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const createCategory = useCreateCategory();

  const errorMessage = empty
    ? t.subscriptions.enterCategoryName
    : duplicate
      ? t.subscriptions.categoryExists
      : createCategory.isError
        ? t.subscriptions.createCategoryFailed({ message: createCategory.error.message })
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
        if (categories.some((c) => c.id === label)) {
          setDuplicate(true);
          inputRef.current?.focus();
          return;
        }
        createCategory.mutate(label, {
          onSuccess: (created) => {
            onCreated(created.id);
          },
        });
      }}
    >
      <label htmlFor={inputId} className="text-xs font-semibold text-muted">
        {t.subscriptions.newCategoryName}
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
          setDuplicate(false);
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
          {t.common.cancel}
        </button>
        <button
          type="submit"
          disabled={createCategory.isPending}
          className={`${textButtonClassName} bg-accent font-semibold text-on-accent`}
        >
          {t.subscriptions.createCategory}
        </button>
      </div>
    </form>
  );
};

const byIds = ({ categories, ids }: { categories: Category[]; ids: string[] }) => {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...categories].sort(
    (a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length),
  );
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface CategoryRowProps {
  category: Category;
  unread: number;
  selected: boolean;
  sortable: boolean;
  saving: boolean;
  onOpen: (categoryId: string) => void;
}

const CategoryRow = ({
  category,
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
  } = useSortable({ id: category.id, disabled: !sortable || saving });
  const t = useT().subscriptions;
  const feedCount = category.feedIds.length;
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
          aria-label={t.reorder({ label: category.label })}
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
        aria-label={category.label}
        aria-describedby={`${detailId} ${unreadId}`}
        onClick={(event) => {
          markPanelOrigin(event.currentTarget);
          onOpen(category.id);
        }}
        className={`${listRowClassName} min-w-0`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            data-tip={category.label}
            data-tip-overflow=""
            className="morph-name max-w-full self-start truncate text-sm font-medium text-ink"
          >
            {category.label}
          </span>
          <span id={detailId} className="morph-detail self-start text-xs text-faint tabular-nums">
            {t.feedCount({ count: feedCount })}
          </span>
        </span>
        <span
          id={unreadId}
          className={`
            flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-surface-2 px-2
            text-xs leading-none font-semibold text-muted tabular-nums
          `}
        >
          {unread}
          <span className="sr-only">{t.unread}</span>
        </span>
        <Icon name="chevron" className="size-4 flex-none text-faint" />
      </button>
    </li>
  );
};

interface CategoriesTabProps {
  categories: Category[];
  /** Category whose panel is open, if any. */
  openCategoryId: string | undefined;
  /** Category row clicked. */
  onOpenCategory: (categoryId: string) => void;
}

export const CategoriesTab = ({
  categories,
  openCategoryId,
  onOpenCategory,
}: CategoriesTabProps) => {
  const t = useT().subscriptions;
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  // dnd-kit clears the drag transforms on drop, so the list must take the new order in that same render.
  const [droppedIds, setDroppedIds] = useState<string[] | null>(null);
  const counts = useCounts();
  const preferences = usePreferences();
  const reorder = useReorderCategories();
  // Read from the mutation cache, so a save started before a tab switch still holds the handles.
  const saving = useSavingPreferences();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = droppedIds === null ? categories : byIds({ categories, ids: droppedIds });
  const shown = ordered.filter((category) => matchesFilter({ filter, texts: [category.label] }));
  // Before preferences load, a drop would write the API order over the stored one.
  const sortable = preferences.data !== undefined && shown.length === categories.length;

  const labelOf = (id: UniqueIdentifier): string =>
    ordered.find((category) => category.id === id)?.label ?? "";
  const positionOf = (id: UniqueIdentifier): string =>
    t.positionOf({
      index: ordered.findIndex((category) => category.id === id) + 1,
      total: ordered.length,
    });
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t.dragPickedUp({ label: labelOf(active.id), position: positionOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t.dragMoved({ label: labelOf(active.id), position: positionOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t.dragDropped({ label: labelOf(active.id), position: positionOf(over.id) })
        : undefined,
    onDragCancel: ({ active }) => t.dragCancelled({ label: labelOf(active.id) }),
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id || saving) return;
    const ids = ordered.map((category) => category.id);
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
          label={t.filterCategories}
          placeholder={t.filterCategoriesPlaceholder}
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
          {t.newCategory}
        </button>
      </div>
      {creating ? (
        <NewCategoryForm
          categories={categories}
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
      {categories.length === 0 ? (
        <EmptyLine>{t.noCategories}</EmptyLine>
      ) : shown.length === 0 ? (
        <EmptyLine>{t.noCategoryMatches({ query: filter.trim() })}</EmptyLine>
      ) : (
        <>
          {reorder.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t.reorderFailed}
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
              items={shown.map((category) => category.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col">
                {shown.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    unread={unreadCountFor({
                      counts: counts.data,
                      streamKey: toStreamKey({ kind: "folder", label: category.id }),
                    })}
                    selected={category.id === openCategoryId}
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
