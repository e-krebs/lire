import { cf, env, ok, run } from "./cloudflare-api.ts";
import { PAGES_PROJECTS, ZONE } from "./deploy-targets.ts";

const LIRE_SUBDOMAIN = "lire-6s2.pages.dev";

type Project = { subdomain: string };
type Named = { name: string };
type DnsRecord = { content: string; proxied: boolean };

void run(async () => {
  const { accountId } = env();
  const pages = `/accounts/${accountId}/pages/projects`;
  const subdomains = new Map<string, string>();

  for (const { name } of PAGES_PROJECTS) {
    const found = await cf<Project>({ path: `${pages}/${name}` });
    let project: Project;
    if (found.status === 404) {
      project = ok({
        response: await cf<Project>({
          path: pages,
          method: "POST",
          body: { name, production_branch: "main" },
        }),
        what: `create project ${name}`,
      });
      console.log(`project ${name}: created`);
    } else {
      project = ok({ response: found, what: `project ${name}` });
      console.log(`project ${name}: ok`);
    }
    if (name === "lire" && project.subdomain !== LIRE_SUBDOMAIN) {
      throw new Error(
        `project lire has subdomain ${project.subdomain}, expected ${LIRE_SUBDOMAIN}; Access does not cover it`,
      );
    }
    subdomains.set(name, project.subdomain);
  }

  const zones = ok({
    response: await cf<{ id: string }[]>({ path: `/zones?name=${ZONE}` }),
    what: `zone ${ZONE}`,
  });
  if (!zones[0]) throw new Error(`zone ${ZONE} not found`);
  const zoneId = zones[0].id;

  for (const { name, domain } of PAGES_PROJECTS) {
    const domains = ok({
      response: await cf<Named[]>({ path: `${pages}/${name}/domains` }),
      what: `domains of ${name}`,
    });
    if (domains.some((d) => d.name === domain)) {
      console.log(`domain ${domain}: ok`);
    } else {
      ok({
        response: await cf({
          path: `${pages}/${name}/domains`,
          method: "POST",
          body: { name: domain },
        }),
        what: `add domain ${domain}`,
      });
      console.log(`domain ${domain}: created`);
    }

    const target = subdomains.get(name) as string;
    const records = ok({
      response: await cf<DnsRecord[]>({
        path: `/zones/${zoneId}/dns_records?name=${domain}&per_page=50`,
      }),
      what: `DNS records of ${domain}`,
    });
    if (!records.length) {
      ok({
        response: await cf({
          path: `/zones/${zoneId}/dns_records`,
          method: "POST",
          body: { type: "CNAME", name: domain, content: target, proxied: true },
        }),
        what: `create DNS record ${domain}`,
      });
      console.log(`dns ${domain}: created`);
      continue;
    }
    const good = records.length === 1 && records[0].content === target && records[0].proxied;
    if (!good) {
      throw new Error(`DNS for ${domain} must be one proxied record to ${target}; fix it by hand`);
    }
    console.log(`dns ${domain}: ok`);
  }
});
