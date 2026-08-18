import { z } from "zod";

const envSchema = z.object({
  PLU_API_KEY: z.string().min(1, "required"),
  PLU_API_BASE_URL: z.url().default("https://api.getplu.com/v1"),
  PLU_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PLU_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  apiKey: string;
  baseUrl: string;
  environment: "sandbox" | "live";
  requestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Reads and validates configuration from the environment.
 * Throws with a readable summary rather than failing later at request time.
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
    apiKey: raw.PLU_API_KEY,
    baseUrl: raw.PLU_API_BASE_URL.replace(/\/+$/, ""),
    environment: raw.PLU_ENVIRONMENT,
    requestTimeoutMs: raw.PLU_REQUEST_TIMEOUT_MS,
    logLevel: raw.LOG_LEVEL,
  };
}
