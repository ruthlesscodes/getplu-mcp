import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/services/config.js";
import { createLogger } from "../src/services/logger.js";
import { PluApiError, PluClient } from "../src/services/plu-client.js";

const config = loadConfig({ PLU_API_KEY: "plu_sk_test", PLU_API_BASE_URL: "https://api.test/v1" });
const logger = createLogger("error");

function clientWith(response: Response) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { client: new PluClient(config, logger, fetchImpl), fetchImpl };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("PluClient", () => {
  it("sends auth and environment headers", async () => {
    const { client, fetchImpl } = clientWith(json({ data: [], hasMore: false }));

    await client.listCards();

    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer plu_sk_test");
    expect(headers["x-plu-environment"]).toBe("sandbox");
  });

  it("serialises filters into the query string", async () => {
    const { client, fetchImpl } = clientWith(json({ data: [], hasMore: false }));

    await client.listCards({ holderType: "agent", limit: 5 });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/v1/cards?holderType=agent&limit=5");
  });

  it("turns an API error body into a PluApiError", async () => {
    const { client } = clientWith(
      json({ error: { code: "card_not_found", message: "No such card" } }, { status: 404 }),
    );

    const error = await client.getCard("card_missing").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PluApiError);
    expect(error).toMatchObject({ status: 404, code: "card_not_found", message: "No such card" });
  });

  it("wraps transport failures as network_error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("socket hang up"));
    const client = new PluClient(config, logger, fetchImpl);

    await expect(client.listCards()).rejects.toMatchObject({ code: "network_error" });
  });
});
