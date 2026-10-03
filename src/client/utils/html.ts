/** Feed titles can arrive with HTML entities still escaped (`&nbsp;`, `&amp;`). */
export const decodeEntities = (text: string): string =>
  new DOMParser().parseFromString(text, "text/html").documentElement.textContent;
