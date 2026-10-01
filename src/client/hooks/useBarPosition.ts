import { useSyncExternalStore } from "react";
import {
  getBarPosition,
  subscribeBarPosition,
  type BarPosition,
} from "client/hooks/utils/barPosition";

export const useBarPosition = (): BarPosition =>
  useSyncExternalStore(subscribeBarPosition, getBarPosition, () => "top");
