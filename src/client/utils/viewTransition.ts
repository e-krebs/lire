// The router leaves a skipped transition's `ready` promise unhandled (AbortError).
export const noViewTransitionRunning = (): boolean => !document.activeViewTransition;
