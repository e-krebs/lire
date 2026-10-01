// 230 words a minute: the middle of the usual 200-250 range for screen prose.
const WORDS_PER_MINUTE = 230;

/** Minutes to read `text`, rounded. Returns 0 for anything under half a minute: the caller hides
 *  the estimate rather than printing "0 min". */
export const readingTime = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return Math.round(trimmed.split(/\s+/).length / WORDS_PER_MINUTE);
};
