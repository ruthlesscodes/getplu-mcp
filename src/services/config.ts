import { z } from "zod";

const envSchema = z.object({
  /** stdio for local clients (Claude Desktop/Code); http for ChatGPT connectors. */
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().default("0.0.0.0"),
  /** Override where market JSON is read from. Defaults to the repo `data/` dir. */
  PLU_MARKET_DATA_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  transport: "stdio" | "http";
  port: number;
  host: string;
  dataDir: string | undefined;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Reads and validates configuration from the environment.
 *
 * No API credentials yet — this milestone serves market configuration only, so
 * the server runs with zero secrets.
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
    logLevel: raw.LOG_LEVEL,
  };
}
