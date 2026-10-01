import type { FeedlyAuth } from "./feedlyAuth";

export interface Env {
  FEEDLY_AUTH: DurableObjectNamespace<FeedlyAuth>;
  FEEDLY_HOST: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_ALLOWED_EMAIL?: string;
  FEEDLY_CLIENT_ID: string;
}
