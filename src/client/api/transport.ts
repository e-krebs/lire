import type { HttpMethod } from "shared/feedsApi/routes";

export interface TransportRequest {
  method: HttpMethod;
  // The full `/api/...` path, as `shared/feedsApi/routes` lists it.
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  // Lets the request outlive the page, for the mark-read flush on `pagehide`.
  keepalive?: boolean;
}

export interface TransportResponse {
  status: number;
  json(): Promise<unknown>;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
