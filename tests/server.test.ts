import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { loadMarketRegistry } from "../src/markets/registry.js";
import { loadConfig } from "../src/services/config.js";
import { createLogger } from "../src/services/logger.js";
import { PluApi } from "../src/services/plu-api.js";

/** Never hits the network: the health response is stubbed. */
function stubApi(fetchImpl: typeof fetch = healthyFetch()): PluApi {
  return new PluApi(loadConfig({}), createLogger("error"), fetchImpl);
}

function healthyFetch(): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", service: "plu-web-api", version: "1.0.0" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

interface MarketPayload {
  supported: boolean;
  country: string | null;
  code: string | null;
  status: string;
  products: Array<{ id: string; name: string; status: string }>;
  funding: Array<{ id: string; status: string }>;
  reason?: string;
}

async function connect(api: PluApi = stubApi()): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    createServer(loadMarketRegistry(), api).connect(serverTransport),
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
  it("exposes the market and status tools", async () => {
    const tools = (await connect().then((client) => client.listTools())).tools;

    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_api_status", "get_market"]);
    expect(tools.find((tool) => tool.name === "get_market")?.inputSchema.properties).toHaveProperty(
      "country",
    );
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

describe("get_api_status over MCP", () => {
  it("reports a healthy GetPlu API", async () => {
    const client = await connect();

    const response = await client.callTool({ name: "get_api_status", arguments: {} });
    const payload = response.structuredContent as unknown as {
      reachable: boolean;
      service: string | null;
      version: string | null;
      endpoint: string;
    };

    expect(response.isError).toBeFalsy();
    expect(payload.reachable).toBe(true);
    expect(payload.service).toBe("plu-web-api");
    expect(payload.version).toBe("1.0.0");
    expect(payload.endpoint).toBe("https://api.getplu.com");
  });

  it("reports an unreachable API as a fact, not a tool error", async () => {
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const client = await connect(stubApi(offline));

    const response = await client.callTool({ name: "get_api_status", arguments: {} });
    const payload = response.structuredContent as unknown as {
      reachable: boolean;
      reason?: string;
    };

    expect(response.isError).toBeFalsy();
    expect(payload.reachable).toBe(false);
    expect(payload.reason).toContain("network_error");
  });
});
