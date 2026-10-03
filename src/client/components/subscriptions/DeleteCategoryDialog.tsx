import { useId, useState } from "react";
import {
  DeleteAndMoveError,
  useCreateCategory,
  useDeleteCategoryAndMove,
  useDeleteCategory,
} from "client/api/queries";
import { feedsInCategory, orphansOf } from "client/api/selectors";
import { useT } from "client/i18n/useT";
import type { Category, Feed } from "shared/feedsApi/types";
import { CategoryPicker } from "./CategoryPicker";
import { ConfirmDialog } from "./ConfirmDialog";

type SubscriptionsMessages = ReturnType<typeof useT>["subscriptions"];

const effectCopy = ({
  total,
  orphans,
  t,
}: {
  total: number;
  orphans: number;
  t: SubscriptionsMessages;
}): string => {
  const shared = total - orphans;
  if (total === 0) return t.effectNone;
  if (orphans === 0) return t.effectAllShared({ count: total });
  if (shared === 0) return t.effectAllOrphans({ count: total });
  return `${t.effectShared({ count: shared, total })} ${t.effectOrphans({ count: orphans })}`;
};

const errorCopy = ({
  error,
  label,
  t,
}: {
  error: Error;
  label: string;
  t: SubscriptionsMessages;
}): string => {
  if (!(error instanceof DeleteAndMoveError)) {
    return t.deleteFailed({ label, message: error.message });
  }
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return t.moveFailed({ count: error.moved, cause, label });
};

interface DeleteCategoryDialogProps {
  /** Dialog is shown. */
  open: boolean;
  /** The category to delete. */
  category: Category;
  /** All categories, for the orphans' target. */
  categories: Category[];
  /** All feeds, to find the feeds left without a category. */
  allFeeds: Feed[];
  /** Dialog dismissed without deleting. */
  onCancel: () => void;
  /** Delete request succeeded. */
  onDeleted: () => void;
}

export const DeleteCategoryDialog = ({
  open,
  category,
  categories,
  allFeeds,
  onCancel,
  onDeleted,
}: DeleteCategoryDialogProps) => {
  const t = useT().subscriptions;
  const checkboxId = useId();
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [moveAll, setMoveAll] = useState(false);
  const deleteAndMove = useDeleteCategoryAndMove();
  const deleteCategory = useDeleteCategory();
  const createCategory = useCreateCategory();

  const total = feedsInCategory({ feeds: allFeeds, categoryId: category.id }).length;
  const orphans = orphansOf({ feeds: allFeeds, categoryId: category.id }).length;
  const shared = total - orphans;
  const moveCount = moveAll ? total : orphans;
  const pending = deleteAndMove.isPending || deleteCategory.isPending;
  const deleteError = deleteAndMove.error ?? deleteCategory.error;

  const cancel = (): void => {
    setTargetId(undefined);
    setMoveAll(false);
    deleteAndMove.reset();
    deleteCategory.reset();
    createCategory.reset();
    onCancel();
  };

  const confirm = (): void => {
    if (moveCount === 0) {
      deleteCategory.mutate({ categoryId: category.id }, { onSuccess: onDeleted });
      return;
    }
    if (targetId === undefined) return;
    deleteAndMove.mutate({ categoryId: category.id, targetId, moveAll }, { onSuccess: onDeleted });
  };

  return (
    <ConfirmDialog
      open={open}
      onCancel={cancel}
      onConfirm={confirm}
      title={t.deleteTitle({ label: category.label })}
      confirmLabel={moveCount === 0 ? t.deleteCategory : t.deleteAndMove({ count: moveCount })}
      confirmDisabled={pending || (moveCount > 0 && targetId === undefined)}
      busy={pending}
      extra={
        <div className="flex flex-col gap-4">
          {moveCount === 0 ? null : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted">{t.moveTo({ count: moveCount })}</p>
              <CategoryPicker
                key={category.id}
                categories={categories}
                selected={targetId === undefined ? [] : [targetId]}
                onChange={([id]) => {
                  setTargetId(id);
                }}
                mode="single"
                exclude={[category.id]}
                onCreate={(label) => {
                  createCategory.mutate(label, {
                    onSuccess: (created) => {
                      // Creating the doomed category's own name returns its id.
                      if (created.id !== category.id) setTargetId(created.id);
                    },
                  });
                }}
              />
            </div>
          )}
          {shared === 0 ? null : (
            <label
              htmlFor={checkboxId}
              className="flex min-h-11 items-center gap-3 text-sm text-ink"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={moveAll}
                onChange={(event) => {
                  setMoveAll(event.target.checked);
                }}
                className="size-5 flex-none accent-accent focus-visible:outline-2 focus-visible:outline-accent"
              />
              <span className="text-pretty">{t.alsoMove({ count: shared })}</span>
            </label>
          )}
          {deleteError === null ? null : (
            <p role="alert" className="text-sm text-danger">
              {errorCopy({ error: deleteError, label: category.label, t })}
            </p>
          )}
          {createCategory.data?.id === category.id && targetId === undefined ? (
            <p role="alert" className="text-sm text-danger">
              {t.pickAnother({ label: category.label })}
            </p>
          ) : null}
          {createCategory.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t.createCategoryFailed({ message: createCategory.error.message })}
            </p>
          ) : null}
        </div>
      }
    >
      {effectCopy({ total, orphans, t })}
    </ConfirmDialog>
  );
};
