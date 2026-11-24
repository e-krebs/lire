export type StepStatus = "done" | "current" | "todo";

export const stepStatuses = <Id extends string>({
  ids,
  current,
}: {
  ids: readonly Id[];
  current: Id;
}): { id: Id; status: StepStatus }[] => {
  const currentIndex = ids.indexOf(current);
  return ids.map((id, index) => ({
    id,
    status: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo",
  }));
};

// The first incomplete step is the furthest reachable one. When none is incomplete, `at(-1)` is the last.
export const furthestStep = <Id extends string>({
  ids,
  complete,
}: {
  ids: readonly Id[];
  complete: (id: Id) => boolean;
}): Id | undefined => ids.at(ids.findIndex((id) => !complete(id)));
