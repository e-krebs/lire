// The row about to open a panel lends its name to the view transition, and takes it back on close
// (styles.css). Set on the DOM before the navigation, since the old state is captured at once.
export const markPanelOrigin = (row: HTMLElement | null): void => {
  for (const other of document.querySelectorAll<HTMLElement>("[data-panel-origin]")) {
    delete other.dataset.panelOrigin;
  }
  if (row) row.dataset.panelOrigin = "";
};
