import { hashKey } from "@tanstack/react-query";
import { httpTransport } from "client/api/adapters/http";
import { ApiError } from "client/api/client";
import { keys } from "client/api/keys";
import { markQueue, settleWithin } from "client/api/markQueue";
import { queryClient } from "client/api/queryClient";

const FLUSH_WAIT_MS = 3000;

// A failed logout keeps the marks and the cache: the session cookie is still valid.
export const signOut = async (): Promise<void> => {
  await settleWithin({ promise: markQueue.flush().catch(() => {}), ms: FLUSH_WAIT_MS });
  // `httpTransport` resolves on any status, so the check is ours.
  const response = await httpTransport({ method: "POST", path: "/api/auth/logout", body: {} });
  if (response.status !== 204) throw new ApiError({ status: response.status, code: "http" });
  await markQueue.clear();
  // Keeps the status query: `clear` would detach the observers that show the sign-in screen.
  queryClient.removeQueries({
    predicate: ({ queryHash }) => queryHash !== hashKey(keys.authStatus),
  });
  queryClient.setQueryData(keys.authStatus, { signedIn: false });
};
