import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type {
  Card,
  CreateCardInput,
  ListCardsInput,
  ListTransactionsInput,
  Page,
  Transaction,
} from "./types.js";

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

/**
 * Thin typed wrapper over the GetPlu REST API.
 *
 * Endpoint paths and payload shapes below are the scaffold's best guess —
 * verify each against the live API reference before wiring this to real keys.
 */
export class PluClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Config, logger: Logger, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
  }

  listCards(input: ListCardsInput = {}): Promise<Page<Card>> {
    return this.request<Page<Card>>("GET", "/cards", { query: input });
  }

  getCard(cardId: string): Promise<Card> {
    return this.request<Card>("GET", `/cards/${encodeURIComponent(cardId)}`);
  }

  createCard(input: CreateCardInput): Promise<Card> {
    return this.request<Card>("POST", "/cards", { body: input });
  }

  setCardStatus(cardId: string, status: "active" | "frozen" | "cancelled"): Promise<Card> {
    return this.request<Card>("POST", `/cards/${encodeURIComponent(cardId)}/status`, {
      body: { status },
    });
  }

  listTransactions(input: ListTransactionsInput = {}): Promise<Page<Transaction>> {
    return this.request<Page<Transaction>>("GET", "/transactions", { query: input });
  }

  private async request<T>(
    method: string,
    path: string,
    options: { query?: object; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.config.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      accept: "application/json",
      "x-plu-environment": this.config.environment,
      "user-agent": "getplu-mcp",
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";

    this.logger.debug("plu request", { method, path });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new PluApiError(0, "network_error", `${method} ${path} failed: ${reason}`);
    }

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const payload = await readJson(response);

    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
      throw new PluApiError(
        response.status,
        error?.code ?? `http_${response.status}`,
        error?.message ?? `${method} ${path} returned ${response.status}`,
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
