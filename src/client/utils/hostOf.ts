export const hostOf = (website: string | undefined): string | undefined => {
  if (website === undefined) return undefined;
  try {
    return new URL(website).hostname;
  } catch {
    return website;
  }
};
