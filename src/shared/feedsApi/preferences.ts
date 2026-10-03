// Lire-owned preference keys. Values are strings; categoryOrder holds a JSON array of category ids.

export const CATEGORY_ORDER_KEY = "lire.categoryOrder";

export const directOpenKey = (feedId: string): string => `lire.directOpen.${feedId}`;
