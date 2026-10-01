import type { HttpMethod } from "shared/feedsApi/paths";

export interface TransportRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface TransportResponse {
  status: number;
  json(): Promise<unknown>;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
