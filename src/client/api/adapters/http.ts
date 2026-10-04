import type { Transport } from "client/api/transport";

const toSearch = (
  query: Record<string, string | number | boolean | undefined> | undefined,
): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
};

const LOGIN_KEY = "lire:access-login";
const LOGIN_GUARD_MS = 60_000;

const goToAccessLogin = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(LOGIN_KEY));
    if (Date.now() - last < LOGIN_GUARD_MS) return false;
  } catch {}
  try {
    sessionStorage.setItem(LOGIN_KEY, String(Date.now()));
  } catch {}
  // The service worker serves the cached shell for page loads, so a reload never reaches Access.
  location.replace("/api/auth/login");
  return true;
};

let navigating = false;

// Same-origin fetch to the Worker — credentials ride the session cookie.
export const httpTransport: Transport = async ({ method, path, query, body, keepalive }) => {
  const url = new URL(`${path}${toSearch(query)}`, location.origin);
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
    ...(keepalive ? { keepalive } : {}),
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (response.type === "opaqueredirect") {
    // Access's login host sends no CORS header: use the login route, which the worker lets through.
    // The page is leaving, so parallel requests must not react.
    if (navigating || goToAccessLogin()) {
      navigating = true;
      return new Promise<never>(() => {});
    }
    return {
      status: 401,
      json: async () => {
        await Promise.resolve();
        return null;
      },
    };
  }
  return {
    status: response.status,
    json: async (): Promise<unknown> => {
      const text = await response.text();
      return text === "" ? null : JSON.parse(text);
    },
  };
};
