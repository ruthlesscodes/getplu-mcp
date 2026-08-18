import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluClient } from "../services/plu-client.js";
import { formatAmount, renderCardsHtml } from "../ui/index.js";
import { guard, htmlResult, textResult } from "./result.js";

export function registerCardTools(server: McpServer, client: PluClient): void {
  server.registerTool(
    "list_cards",
    {
      title: "List cards",
      description:
        "List GetPlu payment cards on the account, optionally filtered by holder type (human or agent) and status.",
      inputSchema: {
        holderType: z.enum(["human", "agent"]).optional().describe("Only cards held by this type."),
        status: z.enum(["active", "frozen", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional().describe("Pagination cursor from a previous call."),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) =>
      guard(async () => {
        const page = await client.listCards(input);
        const summary = page.data
          .map((card) => {
            const holder = `${card.holder.name} (${card.holder.type})`;
            return `- ${card.id} | ${card.brand} ${card.last4} | ${card.status} | ${holder}`;
          })
          .join("\n");
        const more = page.hasMore ? ` | more available (cursor: ${page.nextCursor})` : "";
        const header = `${page.data.length} card(s)${more}`;
        return htmlResult(
          page.data.length ? `${header}\n${summary}` : "No cards match this filter.",
          "ui://getplu/cards",
          renderCardsHtml(page.data),
        );
      }),
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description: "Fetch a single GetPlu card by id, including limits and holder details.",
      inputSchema: {
        cardId: z.string().min(1).describe("The card id, for example card_01H8XYZ."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ cardId }) =>
      guard(async () => {
        const card = await client.getCard(cardId);
        const limit =
          card.spendLimit === undefined
            ? "no limit"
            : `${formatAmount(card.spendLimit, card.currency)} per ${card.spendPeriod ?? "month"}`;
        return textResult(
          [
            `Card ${card.id}`,
            `  ${card.brand} ${card.last4} (${card.kind}, ${card.currency})`,
            `  Status: ${card.status}`,
            `  Holder: ${card.holder.name} - ${card.holder.type} (${card.holder.id})`,
            `  Limit: ${limit}`,
            `  Created: ${card.createdAt}`,
          ].join("\n"),
        );
      }),
  );

  server.registerTool(
    "create_card",
    {
      title: "Create card",
      description:
        "Issue a new GetPlu card for a human or an AI agent. Spend limits are in minor units, so 50000 means 500.00.",
      inputSchema: {
        holderType: z.enum(["human", "agent"]),
        holderId: z
          .string()
          .min(1)
          .describe("Id of the human user or agent that will hold the card."),
        kind: z.enum(["virtual", "physical"]).default("virtual"),
        currency: z.string().length(3).default("USD").describe("ISO-4217 currency code."),
        spendLimit: z.number().int().positive().optional().describe("Cap in minor units."),
        spendPeriod: z.enum(["day", "week", "month", "total"]).optional(),
        label: z.string().max(64).optional().describe("Human-readable name for the card."),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (input) =>
      guard(async () => {
        const card = await client.createCard(input);
        return textResult(
          `Created ${card.kind} card ${card.id} (${card.brand} ${card.last4}) for ${card.holder.name}.`,
        );
      }),
  );

  server.registerTool(
    "set_card_status",
    {
      title: "Set card status",
      description: "Freeze, reactivate, or permanently cancel a card. Cancelling cannot be undone.",
      inputSchema: {
        cardId: z.string().min(1),
        status: z.enum(["active", "frozen", "cancelled"]),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ cardId, status }) =>
      guard(async () => {
        const card = await client.setCardStatus(cardId, status);
        return textResult(`Card ${card.id} is now ${card.status}.`);
      }),
  );
}
