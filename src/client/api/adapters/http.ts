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

// Same-origin fetch to the Worker, mounted under /api — credentials ride the session cookie.
export const httpTransport: Transport = async ({ method, path, query, body }) => {
  const url = new URL(`/api${path}${toSearch(query)}`, location.origin);
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  return {
    status: response.status,
    json: async (): Promise<unknown> => {
      const text = await response.text();
      return text === "" ? null : JSON.parse(text);
    },
  };
};
