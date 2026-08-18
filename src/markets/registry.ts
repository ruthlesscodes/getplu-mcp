import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import {
  fundingDefinitionSchema,
  marketSchema,
  productDefinitionSchema,
  type FundingDefinition,
  type Market,
  type ProductDefinition,
} from "./schema.js";

/** Repo-root `data/` directory, resolved the same way from src/ and dist/. */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

export class MarketDataError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid market data:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "MarketDataError";
    this.problems = problems;
  }
}

export interface MarketRegistry {
  /** Every market, sorted by country code. */
  list(): Market[];
  /** Resolve a user- or model-supplied country string. Undefined if unknown. */
  resolve(query: string): Market | undefined;
  product(id: string): ProductDefinition | undefined;
  funding(id: string): FundingDefinition | undefined;
  readonly size: number;
}

/**
 * Reads every market file in `<dataDir>/markets` plus the two catalogs, then
 * cross-checks them. Called once at startup: a bad data file should stop the
 * server, not surface as a confusing tool response later.
 */
export function loadMarketRegistry(dataDir: string = DEFAULT_DATA_DIR): MarketRegistry {
  const problems: string[] = [];

  const products = readCatalog(join(dataDir, "catalog", "products.json"), productDefinitionSchema, problems);
  const funding = readCatalog(join(dataDir, "catalog", "funding.json"), fundingDefinitionSchema, problems);

  const marketsDir = join(dataDir, "markets");
  const markets = new Map<string, Market>();

  for (const file of listJsonFiles(marketsDir, problems)) {
    const parsed = parseJson(join(marketsDir, file), problems);
    if (parsed === undefined) continue;

    const result = marketSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${file}: ${issue.path.join(".") || "(root)"} ${issue.message}`);
      }
      continue;
    }

    const market = result.data;
    if (markets.has(market.code)) {
      problems.push(`${file}: duplicate country code ${market.code}`);
      continue;
    }
    if (file.toLowerCase() !== `${market.code.toLowerCase()}.json`) {
      problems.push(`${file}: file name should be ${market.code.toLowerCase()}.json`);
    }

    for (const offering of market.products) {
      if (!products.has(offering.id)) {
        problems.push(`${file}: unknown product "${offering.id}" (add it to catalog/products.json)`);
      }
    }
    for (const offering of market.funding) {
      if (!funding.has(offering.id)) {
        problems.push(`${file}: unknown funding method "${offering.id}" (add it to catalog/funding.json)`);
      }
    }

    markets.set(market.code, market);
  }

  if (markets.size === 0) problems.push(`no market files found in ${marketsDir}`);
  if (problems.length > 0) throw new MarketDataError(problems);

  return buildRegistry(markets, products, funding, problems);
}

function buildRegistry(
  markets: Map<string, Market>,
  products: Map<string, ProductDefinition>,
  funding: Map<string, FundingDefinition>,
  problems: string[],
): MarketRegistry {
  const index = new Map<string, Market>();

  const addKey = (key: string, market: Market) => {
    const normalised = normalise(key);
    if (!normalised) return;
    const existing = index.get(normalised);
    if (existing && existing.code !== market.code) {
      problems.push(`alias "${key}" maps to both ${existing.code} and ${market.code}`);
      return;
    }
    index.set(normalised, market);
  };

  for (const market of markets.values()) {
    addKey(market.code, market);
    addKey(market.iso3, market);
    addKey(market.name, market);
    addKey(market.locale.callingCode, market);
    for (const alias of market.aliases) addKey(alias, market);
  }

  if (problems.length > 0) throw new MarketDataError(problems);

  return {
    list: () => [...markets.values()].sort((a, b) => a.code.localeCompare(b.code)),
    resolve: (query: string) => index.get(normalise(query)),
    product: (id: string) => products.get(id),
    funding: (id: string) => funding.get(id),
    size: markets.size,
  };
}

/** Case-, space-, and punctuation-insensitive so "côte d'ivoire" == "Cote dIvoire". */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");
}

function listJsonFiles(dir: string, problems: string[]): string[] {
  try {
    return readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  } catch {
    problems.push(`cannot read markets directory ${dir}`);
    return [];
  }
}

function parseJson(path: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function readCatalog<T extends { id: string }>(
  path: string,
  schema: ZodType<T>,
  problems: string[],
): Map<string, T> {
  const entries = new Map<string, T>();
  const raw = parseJson(path, problems);
  if (raw === undefined) return entries;

  if (!Array.isArray(raw)) {
    problems.push(`${path}: expected a JSON array`);
    return entries;
  }

  raw.forEach((item, position) => {
    const result = schema.safeParse(item);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${path}[${position}]: ${issue.path.join(".") || "(root)"} ${issue.message}`);
      }
      return;
    }
    if (entries.has(result.data.id)) {
      problems.push(`${path}[${position}]: duplicate id "${result.data.id}"`);
      return;
    }
    entries.set(result.data.id, result.data);
  });

  return entries;
}
