import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { PluClient } from "../src/services/plu-client.js";
import type { Card, Transaction } from "../src/services/types.js";

const card: Card = {
  id: "card_agent_01",
  kind: "virtual",
  status: "active",
  brand: "Visa",
  last4: "4242",
  currency: "USD",
  spendLimit: 50_000,
  spendPeriod: "month",
  holder: { type: "agent", id: "agent_01", name: "Research Agent" },
  createdAt: "2026-08-01T09:00:00.000Z",
};

const transaction: Transaction = {
  id: "txn_01",
  cardId: card.id,
  amount: 1299,
  currency: "USD",
  merchant: "OpenRouter",
  status: "settled",
  createdAt: "2026-08-02T11:30:00.000Z",
};

function stubClient(overrides: Partial<PluClient> = {}): PluClient {
  return {
    listCards: vi.fn().mockResolvedValue({ data: [card], hasMore: false }),
    getCard: vi.fn().mockResolvedValue(card),
    createCard: vi.fn().mockResolvedValue(card),
    setCardStatus: vi.fn().mockResolvedValue({ ...card, status: "frozen" }),
    listTransactions: vi.fn().mockResolvedValue({ data: [transaction], hasMore: false }),
    ...overrides,
  } as unknown as PluClient;
}

async function connect(plu: PluClient): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    createServer(plu).connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe("getplu-mcp server", () => {
  let plu: PluClient;

  beforeEach(() => {
    plu = stubClient();
  });

  it("exposes the expected tools", async () => {
    const client = await connect(plu);

    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "create_card",
      "get_card",
      "list_cards",
      "list_transactions",
      "set_card_status",
    ]);
  });

  it("exposes the ui:// resources", async () => {
    const client = await connect(plu);

    const uris = (await client.listResources()).resources.map((resource) => resource.uri).sort();

    expect(uris).toEqual(["ui://getplu/cards", "ui://getplu/transactions"]);
  });

  it("returns text plus an HTML resource from list_cards", async () => {
    const client = await connect(plu);

    const result = await client.callTool({ name: "list_cards", arguments: { holderType: "agent" } });
    const content = result.content as Array<Record<string, unknown>>;

    expect(result.isError).toBeFalsy();
    expect(content[0]).toMatchObject({ type: "text" });
    expect(String(content[0]!.text)).toContain("card_agent_01");
    expect(content[1]).toMatchObject({ type: "resource" });
    expect(plu.listCards).toHaveBeenCalledWith(
      expect.objectContaining({ holderType: "agent", limit: 20 }),
    );
  });

  it("formats a single card for get_card", async () => {
    const client = await connect(plu);

    const result = await client.callTool({ name: "get_card", arguments: { cardId: card.id } });
    const text = String((result.content as Array<{ text?: string }>)[0]?.text);

    expect(text).toContain("Research Agent");
    expect(text).toContain("$500.00 per month");
  });

  it("reports API failures as tool errors instead of throwing", async () => {
    const failing = stubClient({
      getCard: vi.fn().mockRejectedValue(
        Object.assign(new Error("No such card"), {
          name: "PluApiError",
          status: 404,
          code: "card_not_found",
        }),
      ) as PluClient["getCard"],
    });
    const client = await connect(failing);

    const result = await client.callTool({ name: "get_card", arguments: { cardId: "nope" } });

    expect(result.isError).toBe(true);
    expect(String((result.content as Array<{ text?: string }>)[0]?.text)).toContain("No such card");
  });
});
