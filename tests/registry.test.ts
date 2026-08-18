import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR, MarketDataError, loadMarketRegistry } from "../src/markets/registry.js";

const temporaryDirs: string[] = [];

/** A copy of the real data directory that a test can add files to. */
function scratchDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "getplu-markets-"));
  temporaryDirs.push(dir);
  cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
  return dir;
}

afterEach(() => {
  while (temporaryDirs.length) rmSync(temporaryDirs.pop()!, { recursive: true, force: true });
});

describe("market registry", () => {
  it("loads the five launch markets from data/", () => {
    const registry = loadMarketRegistry();

    expect(registry.list().map((market) => market.code)).toEqual(["AR", "KE", "NG", "PH", "SG"]);
    expect(registry.size).toBe(5);
  });

  it("resolves a country by code, iso3, name, alias, and calling code", () => {
    const registry = loadMarketRegistry();

    for (const query of ["NG", "ng", "NGA", "Nigeria", "nigeria", "Naija", "+234"]) {
      expect(registry.resolve(query)?.code, query).toBe("NG");
    }
  });

  it("returns undefined for a country with no market file", () => {
    expect(loadMarketRegistry().resolve("Iceland")).toBeUndefined();
  });

  it("adds a new country from a data file alone, with no code change", () => {
    const dir = scratchDataDir();
    writeFileSync(
      join(dir, "markets", "gh.json"),
      JSON.stringify({
        code: "GH",
        iso3: "GHA",
        name: "Ghana",
        region: "West Africa",
        status: "beta",
        currency: { code: "GHS", symbol: "GH\u20b5" },
        locale: { languages: ["en"], timezone: "Africa/Accra", callingCode: "+233" },
        products: [{ id: "virtual-usd-card", status: "beta" }],
        funding: [{ id: "mobile-money", status: "live" }],
      }),
    );

    const registry = loadMarketRegistry(dir);

    expect(registry.size).toBe(6);
    expect(registry.resolve("Ghana")?.code).toBe("GH");
    expect(registry.resolve("+233")?.name).toBe("Ghana");
  });

  it("rejects a market that references an unknown product", () => {
    const dir = scratchDataDir();
    writeFileSync(
      join(dir, "markets", "gh.json"),
      JSON.stringify({
        code: "GH",
        iso3: "GHA",
        name: "Ghana",
        region: "West Africa",
        status: "beta",
        currency: { code: "GHS", symbol: "GH\u20b5" },
        locale: { languages: ["en"], timezone: "Africa/Accra", callingCode: "+233" },
        products: [{ id: "hoverboard", status: "live" }],
      }),
    );

    expect(() => loadMarketRegistry(dir)).toThrow(MarketDataError);
    expect(() => loadMarketRegistry(dir)).toThrow(/unknown product "hoverboard"/);
  });

  it("rejects a market whose file name does not match its code", () => {
    const dir = scratchDataDir();
    cpSync(join(dir, "markets", "ng.json"), join(dir, "markets", "nigeria.json"));

    expect(() => loadMarketRegistry(dir)).toThrow(/duplicate country code NG|should be ng.json/);
  });

  it("rejects a malformed country code", () => {
    const dir = scratchDataDir();
    writeFileSync(join(dir, "markets", "ng.json"), JSON.stringify({ code: "NGA", name: "Nigeria" }));

    expect(() => loadMarketRegistry(dir)).toThrow(MarketDataError);
  });
});
