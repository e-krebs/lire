import { useId, useState } from "react";
import {
  DeleteAndMoveError,
  useCreateCollection,
  useDeleteCategoryAndMove,
  useDeleteCollection,
} from "client/api/queries";
import { feedsInCategory, orphansOf } from "client/api/selectors";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { CategoryPicker } from "./CategoryPicker";
import { ConfirmDialog } from "./ConfirmDialog";

const feedsWord = (count: number): string => `${count} ${count === 1 ? "feed" : "feeds"}`;

const effectCopy = ({ total, orphans }: { total: number; orphans: number }): string => {
  const shared = total - orphans;
  if (total === 0) return "It holds no feed, so nothing else changes.";
  if (orphans === 0) {
    return total === 1
      ? "Its one feed sits in another category and only loses this one."
      : `All ${total} of its feeds sit in another category and only lose this one.`;
  }
  if (shared === 0) {
    return total === 1
      ? "Its one feed has no other category, so it needs a new one."
      : `Its ${total} feeds have no other category, so they need a new one.`;
  }
  const sharedPart =
    shared === 1
      ? `1 of its ${total} feeds sits in another category and only loses this one.`
      : `${shared} of its ${total} feeds sit in another category and only lose this one.`;
  const orphanPart =
    orphans === 1
      ? "The other one has no other category, so it needs a new one."
      : `The other ${orphans} have no other category, so they need a new one.`;
  return `${sharedPart} ${orphanPart}`;
};

const errorCopy = ({ error, label }: { error: Error; label: string }): string => {
  if (!(error instanceof DeleteAndMoveError)) return `Could not delete ${label}. ${error.message}`;
  const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
  return `Moved ${feedsWord(error.moved)}, then one move failed.${cause} ${label} is still here, so trying again is safe.`;
};

interface DeleteCategoryDialogProps {
  /** Dialog is shown. */
  open: boolean;
  /** The category to delete. */
  category: Collection;
  /** All categories, for the orphans' target. */
  collections: Collection[];
  /** All subscriptions, to find the feeds left without a category. */
  subscriptions: Subscription[];
  /** Dialog dismissed without deleting. */
  onCancel: () => void;
  /** Delete request succeeded. */
  onDeleted: () => void;
}

export const DeleteCategoryDialog = ({
  open,
  category,
  collections,
  subscriptions,
  onCancel,
  onDeleted,
}: DeleteCategoryDialogProps) => {
  const checkboxId = useId();
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [moveAll, setMoveAll] = useState(false);
  const deleteAndMove = useDeleteCategoryAndMove();
  const deleteCollection = useDeleteCollection();
  const createCollection = useCreateCollection();

  const total = feedsInCategory({ subscriptions, categoryId: category.id }).length;
  const orphans = orphansOf({ subscriptions, categoryId: category.id }).length;
  const shared = total - orphans;
  const moveCount = moveAll ? total : orphans;
  const pending = deleteAndMove.isPending || deleteCollection.isPending;
  const deleteError = deleteAndMove.error ?? deleteCollection.error;

  const cancel = (): void => {
    setTargetId(undefined);
    setMoveAll(false);
    deleteAndMove.reset();
    deleteCollection.reset();
    createCollection.reset();
    onCancel();
  };

  const confirm = (): void => {
    if (moveCount === 0) {
      deleteCollection.mutate(category.id, { onSuccess: onDeleted });
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
      title={`Delete ${category.label}?`}
      confirmLabel={moveCount === 0 ? "Delete category" : `Delete and move ${feedsWord(moveCount)}`}
      confirmDisabled={pending || (moveCount > 0 && targetId === undefined)}
      busy={pending}
      extra={
        <div className="flex flex-col gap-4">
          {moveCount === 0 ? null : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted">{`Move ${feedsWord(moveCount)} to`}</p>
              <CategoryPicker
                key={category.id}
                categories={collections}
                selected={targetId === undefined ? [] : [targetId]}
                onChange={([id]) => {
                  setTargetId(id);
                }}
                mode="single"
                exclude={[category.id]}
                onCreate={(label) => {
                  createCollection.mutate(label, {
                    onSuccess: (collection) => {
                      // Creating the doomed category's own name returns its id.
                      if (collection.id !== category.id) setTargetId(collection.id);
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
              <span className="text-pretty">
                {`Also move the ${shared === 1 ? "feed that sits" : `${shared} feeds that sit`} in another category`}
              </span>
            </label>
          )}
          {deleteError === null ? null : (
            <p role="alert" className="text-sm text-danger">
              {errorCopy({ error: deleteError, label: category.label })}
            </p>
          )}
          {createCollection.data?.id === category.id && targetId === undefined ? (
            <p role="alert" className="text-sm text-danger">
              {`${category.label} is the category being deleted. Pick another one.`}
            </p>
          ) : null}
          {createCollection.isError ? (
            <p role="alert" className="text-sm text-danger">
              {`Could not create that category. ${createCollection.error.message}`}
            </p>
          ) : null}
        </div>
      }
    >
      {effectCopy({ total, orphans })}
    </ConfirmDialog>
  );
};
