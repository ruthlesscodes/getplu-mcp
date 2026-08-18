import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/services/config.js";

describe("loadConfig", () => {
  it("defaults to stdio with no environment set", () => {
    expect(loadConfig({})).toEqual({
      transport: "stdio",
      port: 8787,
      host: "0.0.0.0",
      dataDir: undefined,
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

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ PORT: "99999" })).toThrow(/PORT/);
  });
});
