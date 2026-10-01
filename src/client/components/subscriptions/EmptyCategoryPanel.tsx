import { useId, useState } from "react";
import { useRenameCollection } from "client/api/queries";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { AddSourcesMenu } from "./AddSourcesMenu";
import { CategoryActions, CategoryNameForm, primaryClassName } from "./CategoryPanel";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import { feedCountLabel } from "./FeedsTab";
import { SidePanel } from "./SidePanel";

interface EmptyCategoryPanelProps {
  /** The category being edited, which has no feeds. */
  category: Collection;
  /** All categories, for the delete flow. */
  collections: Collection[];
  /** All subscriptions, for the delete flow. */
  subscriptions: Subscription[];
  /** Panel dismissed, or the category was renamed or deleted. */
  onClose: () => void;
  /** "Add website" menu item picked. */
  onAddWebsite: () => void;
  /** "Add newsletter" menu item picked. */
  onAddNewsletter: () => void;
}

// Rule #60: says what belongs here and offers one action, never a bare count of zero.
export const EmptyCategoryPanel = ({
  category,
  collections,
  subscriptions,
  onClose,
  onAddWebsite,
  onAddNewsletter,
}: EmptyCategoryPanelProps) => {
  const formId = useId();
  const [deleting, setDeleting] = useState(false);
  const rename = useRenameCollection();

  return (
    <>
      <SidePanel
        open
        onClose={onClose}
        title={category.label}
        subtitle={feedCountLabel(0)}
        actions={
          <CategoryActions
            formId={formId}
            category={category}
            collections={collections}
            subscriptions={subscriptions}
            renaming={rename.isPending}
            onDelete={() => {
              setDeleting(true);
            }}
          />
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <CategoryNameForm formId={formId} category={category} rename={rename} onSaved={onClose} />
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 px-4 py-6 text-center">
            <p className="text-sm text-ink">No feeds in this category yet.</p>
            <p className="text-sm text-faint text-pretty">
              Add one, or tick this category in another feed’s panel.
            </p>
            <AddSourcesMenu
              onAddWebsite={onAddWebsite}
              onAddNewsletter={onAddNewsletter}
              className={`${primaryClassName} mt-2`}
            />
          </div>
        </div>
      </SidePanel>
      <DeleteCategoryDialog
        open={deleting}
        category={category}
        collections={collections}
        subscriptions={subscriptions}
        onCancel={() => {
          setDeleting(false);
        }}
        onDeleted={() => {
          setDeleting(false);
          onClose();
        }}
      />
    </>
  );
};
