import type { NewsblurAuth } from "./newsblurAuth";

export interface Env {
  NEWSBLUR_AUTH: DurableObjectNamespace<NewsblurAuth>;
  NEWSBLUR_HOST: string;
  NEWSBLUR_CLIENT_ID: string;
  // Worker secrets, written by CI.
  NEWSBLUR_CLIENT_SECRET: string;
  NEWSBLUR_NEWSLETTER_ADDRESS: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_ALLOWED_EMAIL?: string;
}
