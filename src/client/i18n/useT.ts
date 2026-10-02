import { catalogs } from "./messages";
import { useLocale } from "./locale";

export const useT = () => catalogs[useLocale()];
