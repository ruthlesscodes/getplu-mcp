import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MarketRegistry } from "../markets/registry.js";
import { isSupported, type Availability, type Market, type MarketOffering } from "../markets/schema.js";
import { guard, result } from "./result.js";

const offeringOutput = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  description: z.string(),
  note: z.string().optional(),
});

/** Declared so MCP clients receive typed JSON, not just a prose blob. */
const outputSchema = {
  supported: z.boolean(),
  country: z.string().nullable(),
  code: z.string().nullable(),
  status: z.string(),
  region: z.string().nullable(),
  currency: z
    .object({ code: z.string(), symbol: z.string(), minorUnits: z.number() })
    .nullable(),
  products: z.array(offeringOutput),
  funding: z.array(offeringOutput),
  reason: z.string().optional(),
  notes: z.string().optional(),
};

export function registerMarketTools(server: McpServer, registry: MarketRegistry): void {
  server.registerTool(
    "get_market",
    {
      title: "Get GetPlu market availability",
      description:
        "Check whether GetPlu operates in a country and which card products and funding methods are available there. Accepts an ISO 3166 alpha-2 code (NG), alpha-3 code (NGA), a country name (Nigeria), or a calling code (+234).",
      inputSchema: {
        country: z
          .string()
          .min(2)
          .describe("Country to look up: ISO code, country name, or calling code."),
      },
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ country }) =>
      guard(async () => {
        const market = registry.resolve(country);

        if (!market) {
          const payload = {
            supported: false,
            country: null,
            code: null,
            status: "unknown",
            region: null,
            currency: null,
            products: [],
            funding: [],
            reason: `GetPlu has no market configured for "${country}". Supported today: ${registry
              .list()
              .map((entry) => `${entry.name} (${entry.code})`)
              .join(", ")}.`,
          };
          return result(payload.reason, payload);
        }

        const payload = {
          supported: isSupported(market.status),
          country: market.name,
          code: market.code,
          status: market.status,
          region: market.region,
          currency: market.currency,
          products: expand(market.products, (id) => registry.product(id)),
          funding: expand(market.funding, (id) => registry.funding(id)),
          ...(isSupported(market.status)
            ? {}
            : { reason: unsupportedReason(market.name, market.status) }),
          ...(market.notes ? { notes: market.notes } : {}),
        };

        return result(summarise(market, payload.supported), payload);
      }),
  );
}

function expand(
  offerings: MarketOffering[],
  lookup: (id: string) => { name: string; description: string } | undefined,
): Array<{ id: string; name: string; status: string; description: string; note?: string }> {
  return offerings.map((offering) => {
    const definition = lookup(offering.id);
    return {
      id: offering.id,
      name: definition?.name ?? offering.id,
      status: offering.status,
      description: definition?.description ?? "",
      ...(offering.note ? { note: offering.note } : {}),
    };
  });
}

function unsupportedReason(name: string, status: Availability): string {
  return status === "waitlist"
    ? `${name} is on the waitlist — GetPlu is not issuing cards there yet.`
    : `GetPlu does not currently operate in ${name}.`;
}

function summarise(market: Market, supported: boolean): string {
  const live = market.products.filter((product) => isSupported(product.status));
  const header = supported
    ? `GetPlu supports ${market.name} (${market.code}) — status: ${market.status}.`
    : `GetPlu does not support ${market.name} (${market.code}) — status: ${market.status}.`;

  const lines = [
    header,
    `Currency: ${market.currency.code} (${market.currency.symbol}).`,
    live.length
      ? `Available products: ${live.map((product) => product.id).join(", ")}.`
      : "No products available yet.",
    `Funding: ${market.funding.map((method) => `${method.id} (${method.status})`).join(", ")}.`,
  ];

  return lines.join(" ");
}
