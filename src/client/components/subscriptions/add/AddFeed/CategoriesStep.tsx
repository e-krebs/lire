import { useCreateCategory } from "client/api/queries";
import { CategoryPicker } from "client/components/subscriptions/categories/CategoryPicker";
import { useT } from "client/i18n/useT";
import type { Category } from "shared/feedsApi/types";
import { stepFormId } from "./shared";

interface CategoriesStepProps {
  categories: Category[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Why the last subscribe failed. */
  error: string | null;
  /** Why nothing is ticked, once Subscribe was pressed. */
  pickError: string | undefined;
  /** Enter or Subscribe pressed; false when no category is ticked. */
  onSubmit: () => boolean;
}

export const CategoriesStep = ({
  categories,
  selected,
  onChange,
  error,
  pickError,
  onSubmit,
}: CategoriesStepProps) => {
  const t = useT().subscriptions;
  const createCategory = useCreateCategory();
  const createError = createCategory.isError
    ? t.createCategoryFailed({ message: createCategory.error.message })
    : null;
  const shownError = error ?? createError;

  return (
    <form
      id={stepFormId("categories")}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!onSubmit())
          event.currentTarget.querySelector<HTMLElement>("input[type=checkbox]")?.focus();
      }}
    >
      <CategoryPicker
        categories={categories}
        selected={selected}
        onChange={onChange}
        mode="multiple"
        onCreate={(label) => {
          createCategory.mutate(label, {
            onSuccess: (created) => {
              onChange([...selected, created.id]);
            },
          });
        }}
      />
      {selected.length === 0 ? (
        pickError === undefined ? (
          <p className="text-xs text-faint">{t.pickCategory}</p>
        ) : (
          <p role="alert" className="text-sm text-danger">
            {pickError}
          </p>
        )
      ) : null}
      {shownError === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      )}
    </form>
  );
};
