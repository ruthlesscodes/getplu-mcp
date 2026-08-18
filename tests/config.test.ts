import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/services/config.js";

describe("loadConfig", () => {
  it("applies defaults when only the API key is set", () => {
    const config = loadConfig({ PLU_API_KEY: "plu_sk_test" });

    expect(config).toMatchObject({
      apiKey: "plu_sk_test",
      baseUrl: "https://api.getplu.com/v1",
      environment: "sandbox",
      requestTimeoutMs: 15_000,
      logLevel: "info",
    });
  });

  it("strips trailing slashes from the base URL", () => {
    const config = loadConfig({
      PLU_API_KEY: "plu_sk_test",
      PLU_API_BASE_URL: "https://sandbox.getplu.com/v1//",
    });

    expect(config.baseUrl).toBe("https://sandbox.getplu.com/v1");
  });

  it("rejects a missing API key", () => {
    expect(() => loadConfig({})).toThrow(/PLU_API_KEY/);
  });

  it("rejects an unknown environment", () => {
    expect(() => loadConfig({ PLU_API_KEY: "k", PLU_ENVIRONMENT: "staging" })).toThrow(
      /PLU_ENVIRONMENT/,
    );
  });
});
