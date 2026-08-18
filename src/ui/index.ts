import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluClient } from "../services/plu-client.js";
import { renderCardsHtml, renderTransactionsHtml } from "./templates.js";

export { renderCardsHtml, renderTransactionsHtml, formatAmount, escapeHtml } from "./templates.js";

/**
 * Registers read-only `ui://` resources. Tools stay the write path; these exist
 * so a client can pull a rendered snapshot without issuing a tool call.
 */
export function registerUiResources(server: McpServer, client: PluClient): void {
  server.registerResource(
    "cards-view",
    "ui://getplu/cards",
    {
      title: "Cards overview",
      description: "Rendered table of the cards on this GetPlu account.",
      mimeType: "text/html",
    },
    async (uri) => {
      const page = await client.listCards({ limit: 50 });
      return {
        contents: [{ uri: uri.href, mimeType: "text/html", text: renderCardsHtml(page.data) }],
      };
    },
  );

  server.registerResource(
    "transactions-view",
    "ui://getplu/transactions",
    {
      title: "Recent transactions",
      description: "Rendered table of the most recent transactions across all cards.",
      mimeType: "text/html",
    },
    async (uri) => {
      const page = await client.listTransactions({ limit: 50 });
      return {
        contents: [
          { uri: uri.href, mimeType: "text/html", text: renderTransactionsHtml(page.data) },
        ],
      };
    },
  );
}
