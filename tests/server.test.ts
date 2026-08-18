import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { loadMarketRegistry } from "../src/markets/registry.js";

interface MarketPayload {
  supported: boolean;
  country: string | null;
  code: string | null;
  status: string;
  products: Array<{ id: string; name: string; status: string }>;
  funding: Array<{ id: string; status: string }>;
  reason?: string;
}

async function connect(): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    createServer(loadMarketRegistry()).connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function getMarket(client: Client, country: string): Promise<MarketPayload> {
  const response = await client.callTool({ name: "get_market", arguments: { country } });
  expect(response.isError).toBeFalsy();
  return response.structuredContent as unknown as MarketPayload;
}

describe("get_market over MCP", () => {
  it("exposes exactly one tool", async () => {
    const tools = (await connect().then((client) => client.listTools())).tools;

    expect(tools.map((tool) => tool.name)).toEqual(["get_market"]);
    expect(tools[0]?.inputSchema.properties).toHaveProperty("country");
  });

  it("returns the shape the foundation milestone specifies", async () => {
    const client = await connect();

    const market = await getMarket(client, "NG");

    expect(market.supported).toBe(true);
    expect(market.country).toBe("Nigeria");
    expect(market.products.length).toBeGreaterThan(0);
  });

  it("answers for every launch market", async () => {
    const client = await connect();

    const answers = await Promise.all(
      ["NG", "KE", "AR", "PH", "SG"].map((code) => getMarket(client, code)),
    );

    expect(answers.map((market) => market.country)).toEqual([
      "Nigeria",
      "Kenya",
      "Argentina",
      "Philippines",
      "Singapore",
    ]);
    expect(answers.every((market) => market.supported)).toBe(true);
  });

  it("reflects per-market differences rather than one global answer", async () => {
    const client = await connect();

    const [kenya, singapore] = await Promise.all([
      getMarket(client, "Kenya"),
      getMarket(client, "Singapore"),
    ]);

    expect(kenya!.funding.map((method) => method.id)).toContain("mobile-money");
    expect(singapore!.funding.map((method) => method.id)).not.toContain("mobile-money");
    expect(singapore!.products.find((product) => product.id === "physical-card")?.status).toBe("live");
    expect(kenya!.products.find((product) => product.id === "physical-card")?.status).toBe("waitlist");
  });

  it("resolves a country name, not just a code", async () => {
    const client = await connect();

    expect((await getMarket(client, "Philippines")).code).toBe("PH");
    expect((await getMarket(client, "+54")).code).toBe("AR");
  });

  it("reports an unconfigured country as unsupported instead of failing", async () => {
    const client = await connect();

    const market = await getMarket(client, "Iceland");

    expect(market.supported).toBe(false);
    expect(market.country).toBeNull();
    expect(market.products).toEqual([]);
    expect(market.reason).toContain("Nigeria (NG)");
  });

  it("also returns a text summary for clients that ignore structured output", async () => {
    const client = await connect();

    const response = await client.callTool({ name: "get_market", arguments: { country: "NG" } });
    const text = String((response.content as Array<{ text?: string }>)[0]?.text);

    expect(text).toContain("GetPlu supports Nigeria (NG)");
    expect(text).toContain("NGN");
  });
});
