# getplu-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that answers one question for
any country on earth: **does GetPlu operate here, and what can a user do?**

```
ChatGPT  →  GetPlu MCP  →  get_market("NG")  →  { supported: true, country: "Nigeria", products: [...] }
```

Country coverage is **data, not code**. Adding market #6, #20, or #125 means dropping one JSON file
into `data/markets/` — no TypeScript is touched, no build changes, no deploy logic. Five markets
ship today (Nigeria, Kenya, Argentina, Philippines, Singapore), chosen because their user behaviour
and funding rails differ sharply enough to stress the framework.

## Docs

| Document | What it covers |
| --- | --- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | The country → intent → product → localized UI → onboarding → attribution pipeline, stage by stage |
| [docs/COUNTRY_MATRIX.md](docs/COUNTRY_MATRIX.md) | The five launch markets, what makes each one different, and how to add the sixth |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md) | Tool contracts, transport requirements, and conventions for adding a tool |

## Scope

This is the foundation milestone. Deliberately **not** built yet: UI, Agent Card, authenticated
accounts, transactions. One read-only tool, no secrets, no database.

## Quick start

```bash
npm install
npm test
npm run build

# stdio — Claude Desktop, Claude Code
npm start

# Streamable HTTP — required for ChatGPT
MCP_TRANSPORT=http npm start
curl http://localhost:8787/health
```

## Adding a country

1. Create `data/markets/<code>.json` (lowercase ISO alpha-2 filename).
2. Reference product and funding ids that already exist in `data/catalog/`.
3. Restart. That's it.

```json
{
  "code": "GH",
  "iso3": "GHA",
  "name": "Ghana",
  "aliases": ["Republic of Ghana"],
  "region": "West Africa",
  "status": "beta",
  "currency": { "code": "GHS", "symbol": "GH₵", "minorUnits": 2 },
  "locale": { "languages": ["en"], "timezone": "Africa/Accra", "callingCode": "+233" },
  "products": [{ "id": "virtual-usd-card", "status": "beta" }],
  "funding": [{ "id": "mobile-money", "status": "live" }],
  "compliance": { "kycRequired": true, "tiers": ["ghana-card"], "regulator": "Bank of Ghana" }
}
```

The registry validates every file at startup and **refuses to boot** on a bad one, naming the file,
the field, and the fix. A market referencing a product that isn't in the catalog is an error, not a
silently empty list. New products or funding rails are added once to `data/catalog/` and then reused
by every market.

`status` drives supportability: `live` and `beta` are supported; `waitlist` and `unsupported` are
not. The same field works per-product, so Singapore can have `physical-card: live` while Kenya has
it on `waitlist`.

## The tool

`get_market(country)` — accepts an ISO alpha-2 (`NG`), alpha-3 (`NGA`), country name (`Nigeria`),
alias (`Naija`), or calling code (`+234`). Matching ignores case, spacing, punctuation, and accents.

Returns structured JSON (plus a text summary for clients that ignore structured output):

```json
{
  "supported": true,
  "country": "Nigeria",
  "code": "NG",
  "status": "live",
  "region": "West Africa",
  "currency": { "code": "NGN", "symbol": "₦", "minorUnits": 2 },
  "products": [{ "id": "virtual-usd-card", "name": "Virtual USD Card", "status": "live", "description": "..." }],
  "funding": [{ "id": "bank-transfer", "name": "Bank Transfer", "status": "live", "description": "..." }],
  "notes": "..."
}
```

An unconfigured country is a **valid answer, not an error** — `supported: false` with a `reason`
listing where GetPlu does operate.

## Connecting ChatGPT

ChatGPT connectors require a **remote HTTPS** MCP server. stdio will not work.

1. Run with `MCP_TRANSPORT=http` and expose it over HTTPS (deploy, or `ngrok http 8787` for a test).
2. In ChatGPT: **Settings → Connectors → Create**, and give it the `/mcp` URL.
3. Enable the connector in a conversation, then ask *"Does GetPlu work in Nigeria?"*

The endpoint is stateless — a fresh server per request, no session store — so it scales
horizontally and survives cold starts.

## Connecting Claude

```bash
claude mcp add getplu -- node /absolute/path/to/getplu-mcp/dist/server.js
```

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `8787` | HTTP transport only |
| `HOST` | `0.0.0.0` | HTTP transport only |
| `PLU_MARKET_DATA_DIR` | repo `data/` | Point at a mounted volume in production |
| `LOG_LEVEL` | `info` | Logs go to stderr; stdout is the protocol stream |

No API keys. This milestone reads configuration files only.

## Layout

```
getplu-mcp
├── data/
│   ├── catalog/          products.json, funding.json — defined once, reused everywhere
│   └── markets/          one file per country: ng, ke, ar, ph, sg
├── src/
│   ├── server.ts         transport selection (stdio | streamable HTTP)
│   ├── markets/          schema.ts (the contract), registry.ts (load + validate + resolve)
│   ├── tools/            get-market.ts
│   └── services/         config.ts, logger.ts
└── tests/
```

## Tests

`npm test` — 18 cases covering config, registry loading and validation, and the tool end to end over
an in-memory MCP transport. One test proves the central claim by writing a sixth country to a temp
directory and asserting it resolves with no code change.
