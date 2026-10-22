import type { NewsblurAuth } from "./newsblurAuth";

export interface Env {
  NEWSBLUR_AUTH: DurableObjectNamespace<NewsblurAuth>;
  NEWSBLUR_HOST: string;
  // Worker secrets, written by CI.
  NEWSBLUR_OAUTH_CLIENT_ID: string;
  NEWSBLUR_OAUTH_CLIENT_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_ALLOWED_EMAIL?: string;
}
