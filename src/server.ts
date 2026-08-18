#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./services/config.js";
import { createLogger } from "./services/logger.js";
import { PluClient } from "./services/plu-client.js";
import { registerTools } from "./tools/index.js";
import { registerUiResources } from "./ui/index.js";

export const SERVER_NAME = "getplu-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds a fully wired server. Exported so tests can pass a stub client and
 * drive it over an in-memory transport.
 */
export function createServer(client: PluClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Tools for GetPlu payment cards issued to humans and AI agents. Amounts are in minor units (cents). Confirm with the user before creating or cancelling a card.",
    },
  );

  registerTools(server, client);
  registerUiResources(server, client);

  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = new PluClient(config, logger);
  const server = createServer(client);

  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down`);
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.connect(new StdioServerTransport());
  logger.info("listening on stdio", { environment: config.environment, baseUrl: config.baseUrl });
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[getplu-mcp] FATAL ${detail}\n`);
    process.exit(1);
  });
}
