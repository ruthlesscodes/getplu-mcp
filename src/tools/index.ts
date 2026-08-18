import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MarketRegistry } from "../markets/registry.js";
import { registerMarketTools } from "./get-market.js";

export { registerMarketTools } from "./get-market.js";

/** Single place every tool module gets wired in. */
export function registerTools(server: McpServer, registry: MarketRegistry): void {
  registerMarketTools(server, registry);
}
