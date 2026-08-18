#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadMarketRegistry, type MarketRegistry } from "./markets/registry.js";
import { loadConfig } from "./services/config.js";
import { createLogger, type Logger } from "./services/logger.js";
import { PluApi } from "./services/plu-api.js";
import { registerTools } from "./tools/index.js";

export const SERVER_NAME = "getplu-mcp";
export const SERVER_VERSION = "0.2.0";

/**
 * Builds a fully wired server. Exported so tests can drive it over an
 * in-memory transport with a registry loaded from fixtures.
 */
export function createServer(registry: MarketRegistry, api: PluApi): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "GetPlu market availability. Call get_market with a country code or name to find out whether GetPlu operates there and which card products and funding methods are available. Call get_api_status to check whether the GetPlu API itself is up.",
    },
  );

  registerTools(server, registry, api);
  return server;
}

/** stdio: one long-lived server, for Claude Desktop and Claude Code. */
async function runStdio(registry: MarketRegistry, api: PluApi, logger: Logger): Promise<void> {
  const server = createServer(registry, api);

  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down`);
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.connect(new StdioServerTransport());
  logger.info("listening on stdio", { markets: registry.size });
}

/**
 * Streamable HTTP: what ChatGPT connectors require. Stateless — a fresh server
 * and transport per request — so it scales horizontally with no shared session
 * store. Every response is plain JSON rather than an SSE stream.
 */
async function runHttp(registry: MarketRegistry, api: PluApi, logger: Logger, host: string, port: number): Promise<void> {
  const http = createHttpServer((req, res) => {
    void handleHttpRequest(req, res, registry, api, logger).catch((error: unknown) => {
      logger.error("request failed", { message: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify(rpcError(-32603, "Internal server error")));
      }
    });
  });

  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  logger.info(`listening on http://${host}:${port}/mcp`, { markets: registry.size });

  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down`);
    http.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: MarketRegistry,
  api: PluApi,
  logger: Logger,
): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", markets: registry.size, version: SERVER_VERSION }));
    return;
  }

  if (path !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify(rpcError(-32601, `Unknown path ${path}. MCP endpoint is /mcp.`)));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", allow: "POST, OPTIONS" });
    res.end(JSON.stringify(rpcError(-32000, "Use POST for the stateless MCP endpoint.")));
    return;
  }

  const body = await readJsonBody(req);
  const server = createServer(registry, api);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  logger.debug("mcp request", { method: (body as { method?: string } | null)?.method });
  await transport.handleRequest(req, res, body);
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, mcp-session-id, mcp-protocol-version");
}

function rpcError(code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const registry = loadMarketRegistry(config.dataDir);
  const api = new PluApi(config, logger);

  logger.info("markets loaded", { codes: registry.list().map((market) => market.code) });
  logger.info("plu api", { baseUrl: config.apiBaseUrl, authenticated: config.apiToken !== undefined });

  if (config.transport === "http") {
    await runHttp(registry, api, logger, config.host, config.port);
  } else {
    await runStdio(registry, api, logger);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[getplu-mcp] FATAL ${detail}\n`);
    process.exit(1);
  });
}
