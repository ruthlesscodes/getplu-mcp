import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MarketRegistry } from "../markets/registry.js";
import type { PluApi } from "../services/plu-api.js";
import { registerMarketTools } from "./get-market.js";
import { registerStatusTools } from "./status.js";

export { registerMarketTools } from "./get-market.js";
export { registerStatusTools } from "./status.js";

/** Single place every tool module gets wired in. */
export function registerTools(server: McpServer, registry: MarketRegistry, api: PluApi): void {
  registerMarketTools(server, registry);
  registerStatusTools(server, api);
}
