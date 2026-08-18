import { z } from "zod";

const envSchema = z.object({
  /** stdio for local clients (Claude Desktop/Code); http for ChatGPT connectors. */
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().default("0.0.0.0"),
  /** Override where market JSON is read from. Defaults to the repo `data/` dir. */
  PLU_MARKET_DATA_DIR: z.string().optional(),
  /** PLU REST API. Health is public; everything else needs a credential. */
  PLU_API_BASE_URL: z.url().default("https://api.getplu.com"),
  PLU_API_TOKEN: z.string().min(1).optional(),
  PLU_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  transport: "stdio" | "http";
  port: number;
  host: string;
  dataDir: string | undefined;
  apiBaseUrl: string;
  apiToken: string | undefined;
  apiTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Reads and validates configuration from the environment.
 *
 * PLU_API_TOKEN is optional: the only endpoint wired up so far (/api/health) is
 * public, so the server still runs with zero secrets.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nSee .env.example for the expected variables.`,
    );
  }

  const raw = parsed.data;
  return {
    transport: raw.MCP_TRANSPORT,
    port: raw.PORT,
    host: raw.HOST,
    dataDir: raw.PLU_MARKET_DATA_DIR,
    apiBaseUrl: raw.PLU_API_BASE_URL.replace(/\/+$/, ""),
    apiToken: raw.PLU_API_TOKEN,
    apiTimeoutMs: raw.PLU_API_TIMEOUT_MS,
    logLevel: raw.LOG_LEVEL,
  };
}
