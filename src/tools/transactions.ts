import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluClient } from "../services/plu-client.js";
import { formatAmount, renderTransactionsHtml } from "../ui/index.js";
import { guard, htmlResult } from "./result.js";

export function registerTransactionTools(server: McpServer, client: PluClient): void {
  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description:
        "List card transactions, newest first. Filter to one card and/or a start time to narrow the window.",
      inputSchema: {
        cardId: z.string().optional().describe("Restrict to a single card."),
        since: z.iso
          .datetime()
          .optional()
          .describe("ISO-8601 timestamp; only transactions at or after this point."),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional().describe("Pagination cursor from a previous call."),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) =>
      guard(async () => {
        const page = await client.listTransactions(input);
        const lines = page.data.map((tx) => {
          const reason = tx.declineReason ? ` (${tx.declineReason})` : "";
          const amount = formatAmount(tx.amount, tx.currency);
          return `- ${tx.createdAt} | ${tx.merchant} | ${amount} | ${tx.status}${reason}`;
        });
        const more = page.hasMore ? ` | more available (cursor: ${page.nextCursor})` : "";
        const header = `${page.data.length} transaction(s)${more}`;
        return htmlResult(
          page.data.length ? `${header}\n${lines.join("\n")}` : "No transactions in this window.",
          "ui://getplu/transactions",
          renderTransactionsHtml(page.data),
        );
      }),
  );
}
