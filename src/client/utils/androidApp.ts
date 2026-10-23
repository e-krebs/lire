import { isTWA } from "client/utils/externalLinks";

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=tech.krebs.lire";

export const isAndroidBrowser = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Android") && !isTWA();
