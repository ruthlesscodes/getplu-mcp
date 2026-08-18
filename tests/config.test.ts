import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/services/config.js";

describe("loadConfig", () => {
  it("defaults to stdio with no environment set", () => {
    expect(loadConfig({})).toEqual({
      transport: "stdio",
      port: 8787,
      host: "0.0.0.0",
      dataDir: undefined,
      apiBaseUrl: "https://api.getplu.com",
      apiToken: undefined,
      apiTimeoutMs: 10_000,
      logLevel: "info",
    });
  });

  it("switches to the HTTP transport for ChatGPT connectors", () => {
    const config = loadConfig({ MCP_TRANSPORT: "http", PORT: "3000" });

    expect(config.transport).toBe("http");
    expect(config.port).toBe(3000);
  });

  it("rejects an unknown transport", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "grpc" })).toThrow(/MCP_TRANSPORT/);
  });

  it("runs without an API token, since /api/health is public", () => {
    expect(loadConfig({}).apiToken).toBeUndefined();
    expect(loadConfig({ PLU_API_TOKEN: "tok_123" }).apiToken).toBe("tok_123");
  });

  it("strips trailing slashes from the API base URL", () => {
    expect(loadConfig({ PLU_API_BASE_URL: "https://api.getplu.com//" }).apiBaseUrl).toBe(
      "https://api.getplu.com",
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ PORT: "99999" })).toThrow(/PORT/);
  });
});
