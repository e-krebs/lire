import { ACCESS_HOSTNAMES, PUBLIC_HOSTNAMES } from "./deploy-targets.ts";
import { readWranglerVar, run } from "./cloudflare-api.ts";

const ATTEMPTS = 7;
const DELAY_MS = 10_000;

type Result = { ok: boolean; detail: string };

const check = async ({
  url,
  accessHost,
  protectedUrl,
}: {
  url: string;
  accessHost: string;
  protectedUrl: boolean;
}): Promise<Result> => {
  try {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location");
    const host = location ? new URL(location, url).host : "";
    if (protectedUrl) {
      const ok = (res.status === 302 || res.status === 303) && host === accessHost;
      return { ok, detail: `${res.status} ${host || "no location"}` };
    }
    const ok = res.status === 200 || (res.status >= 300 && res.status < 400 && host !== accessHost);
    return { ok, detail: `${res.status} ${host}`.trim() };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return { ok: false, detail: `fetch failed: ${cause?.code ?? (error as Error).message}` };
  }
};

const withRetries = async (options: Parameters<typeof check>[0]) => {
  let result = await check(options);
  for (let attempt = 1; attempt < ATTEMPTS && !result.ok; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    result = await check(options);
  }
  return result;
};

void run(async () => {
  const accessHost = readWranglerVar("ACCESS_TEAM_DOMAIN").replace(/^https?:\/\//, "");
  const targets = [
    ...[
      "https://lire.krebs.tech/api/auth/status",
      "https://lire.krebs.tech/",
      `https://${ACCESS_HOSTNAMES[1]}/`,
    ].map((url) => ({ url, protectedUrl: true })),
    ...PUBLIC_HOSTNAMES.map((host) => ({ url: `https://${host}/`, protectedUrl: false })),
  ];
  const results = await Promise.all(
    targets.map(async (target) => ({
      ...target,
      ...(await withRetries({ ...target, accessHost })),
    })),
  );
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.url} ${r.detail}`);
  if (results.some((r) => !r.ok)) process.exit(1);
});
