import { readFileSync } from "node:fs";

type CfError = { code?: number; message?: string };

type CfResponse<T> = {
  status: number;
  success: boolean;
  result: T;
  errors: CfError[];
  resultInfo?: { total_pages?: number };
};

export const cf = async <T = any>({
  path,
  method = "GET",
  body,
}: {
  path: string;
  method?: string;
  body?: unknown;
}): Promise<CfResponse<T>> => {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: T;
      errors?: CfError[];
      result_info?: { total_pages?: number };
    };
    return {
      status: res.status,
      success: json.success ?? false,
      result: json.result as T,
      errors: json.errors ?? [],
      resultInfo: json.result_info,
    };
  } catch (error) {
    return {
      status: 0,
      success: false,
      result: undefined as T,
      errors: [{ message: `request failed: ${(error as Error).message}` }],
    };
  }
};

export const ok = <T>({ response, what }: { response: CfResponse<T>; what: string }): T => {
  if (!response.success) {
    const detail = response.errors.map((e) => e.message ?? e.code).join("; ") || "no detail";
    throw new Error(`${what}: HTTP ${response.status}, ${detail}`);
  }
  if ((response.resultInfo?.total_pages ?? 1) > 1) {
    throw new Error(`${what}: result spans several pages, which this script does not handle`);
  }
  return response.result;
};

export const env = () => {
  const missing = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter(
    (name) => !process.env[name],
  );
  if (missing.length) {
    console.error(`Missing env var(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
  };
};

export const readWranglerVar = (name: string) => {
  const match = readFileSync("wrangler.toml", "utf8").match(
    new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"),
  );
  if (!match) throw new Error(`${name} not found in wrangler.toml`);
  return match[1];
};

export const run = (main: () => Promise<void>) =>
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
