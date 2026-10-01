import { cf, env, ok, readWranglerVar, run } from "./cloudflare-api.ts";
import { ACCESS_HOSTNAMES } from "./deploy-targets.ts";

type Policy = {
  decision?: string;
  include?: { email?: { email?: string } }[];
};

type App = {
  id: string;
  aud: string;
  domain?: string;
  self_hosted_domains?: string[];
  destinations?: {
    uri?: string;
    type?: string;
    overrides?: { behavior?: string; path?: string }[];
  }[];
  policies?: Policy[];
};

void run(async () => {
  const { accountId } = env();
  const pin = process.env.ACCESS_ALLOWED_EMAIL;
  if (!pin) {
    console.error("Missing env var: ACCESS_ALLOWED_EMAIL");
    process.exit(1);
  }
  const mismatches: string[] = [];
  const base = `/accounts/${accountId}/access`;

  const org = ok({
    response: await cf<{ auth_domain?: string }>({ path: `${base}/organizations` }),
    what: "Access organization",
  });
  const teamDomain = readWranglerVar("ACCESS_TEAM_DOMAIN");
  if (org.auth_domain !== teamDomain) {
    mismatches.push(
      `team domain: Cloudflare has ${org.auth_domain}, wrangler.toml has ${teamDomain}`,
    );
  }

  const apps = ok({
    response: await cf<App[]>({ path: `${base}/apps?per_page=50` }),
    what: "Access applications",
  });
  const aud = readWranglerVar("ACCESS_AUD");
  const app = apps.find((a) => a.aud === aud);
  if (!app) {
    mismatches.push("no Access application has the AUD set in wrangler.toml");
  } else {
    const hosts = new Set(
      [
        app.domain,
        ...(app.self_hosted_domains ?? []),
        ...(app.destinations ?? []).map((d) => d.uri),
      ].filter(Boolean),
    );
    for (const host of ACCESS_HOSTNAMES) {
      if (!hosts.has(host)) mismatches.push(`application does not cover ${host}`);
    }
    for (const dest of app.destinations ?? []) {
      for (const override of dest.overrides ?? []) {
        mismatches.push(
          `destination ${dest.uri ?? dest.type} has a ${override.behavior} override on ${override.path}`,
        );
      }
    }

    const legacy = ok({
      response: await cf<Policy[]>({ path: `${base}/apps/${app.id}/policies?per_page=50` }),
      what: "Access policies",
    });
    const policies = [...(app.policies ?? []), ...legacy];
    if (!policies.length) mismatches.push("application has no policy");
    const emails = new Set<string>();
    for (const policy of policies) {
      if (policy.decision !== "allow") {
        mismatches.push(`a policy has decision ${policy.decision}, expected allow`);
      }
      for (const rule of policy.include ?? []) {
        if (rule.email?.email) emails.add(rule.email.email);
        else mismatches.push("a policy include rule is not an email rule");
      }
    }
    if (emails.size !== 1 || !emails.has(pin)) {
      mismatches.push(`policy emails (${emails.size}) differ from ACCESS_ALLOWED_EMAIL`);
    }
  }

  if (mismatches.length) {
    console.error(`Access check: ${mismatches.length} mismatch(es)\n- ${mismatches.join("\n- ")}`);
    process.exit(1);
  }
  console.log("access check: ok");
});
