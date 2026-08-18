import type { Config } from "./config.js";
import type { Logger } from "./logger.js";

/** Shape the PLU API uses for failures: {success:false, error:{message, code}}. */
interface ApiErrorEnvelope {
  success?: boolean;
  error?: { message?: string; code?: string };
}

export class PluApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "PluApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

/**
 * Client for the PLU API at api.getplu.com.
 *
 * Only /api/health is wired up so far — it is the one endpoint that needs no
 * credentials, which makes it the honest test of end-to-end reachability.
 * Everything else in the API is authenticated; see docs/MCP_TOOLS.md for the
 * open question about which credential an MCP server should carry.
 */
export class PluApi {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Config, logger: Logger, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config.apiBaseUrl;
    this.token = config.apiToken;
    this.timeoutMs = config.apiTimeoutMs;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
  }

  get endpoint(): string {
    return this.baseUrl;
  }

  /** Unauthenticated liveness check. */
  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/api/health");
  }

  async request<T>(
    method: string,
    path: string,
    options: { query?: object; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "getplu-mcp",
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    this.logger.debug("plu api request", { method, path });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new PluApiError(0, "network_error", `${method} ${path} failed: ${reason}`);
    }

    const requestId = response.headers.get("x-railway-request-id") ?? undefined;
    const payload = await readJson(response);

    if (!response.ok) {
      const envelope = payload as ApiErrorEnvelope | null;
      throw new PluApiError(
        response.status,
        envelope?.error?.code ?? `http_${response.status}`,
        envelope?.error?.message ?? `${method} ${path} returned ${response.status}`,
        requestId,
      );
    }

    return payload as T;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
