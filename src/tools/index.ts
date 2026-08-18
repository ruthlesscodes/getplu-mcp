import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluClient } from "../services/plu-client.js";
import { registerCardTools } from "./cards.js";
import { registerTransactionTools } from "./transactions.js";

export { registerCardTools } from "./cards.js";
export { registerTransactionTools } from "./transactions.js";

/** Single place every tool module gets wired in. */
export function registerTools(server: McpServer, client: PluClient): void {
  registerCardTools(server, client);
  registerTransactionTools(server, client);
}
