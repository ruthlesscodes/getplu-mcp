# MCP Tools

Reference for every tool this server exposes, and the conventions any new tool must follow.

## Transport

| Transport | Command | Use with |
| --- | --- | --- |
| stdio | `npm start` | Claude Desktop, Claude Code, local dev |
| Streamable HTTP | `MCP_TRANSPORT=http npm start` | **ChatGPT connectors** |

**ChatGPT cannot connect over stdio.** Connectors require a remote HTTPS endpoint speaking
Streamable HTTP. The HTTP transport is stateless — a fresh server per request, no session store —
so it scales horizontally and survives cold starts.

Endpoints: `POST /mcp` (protocol), `GET /health` (liveness, returns market count and version).

Protocol version: `2025-06-18`. Server identity: `getplu-mcp`.

---

## `get_market` ✅

Check whether GetPlu operates in a country and what is available there.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`.

### Input

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `country` | string (min 2) | yes | ISO alpha-2, alpha-3, country name, alias, or calling code |

Resolution is case-, space-, punctuation-, and accent-insensitive. All of these return Nigeria:

```
NG   ng   NGA   Nigeria   nigeria   Naija   +234
```

Models pass messy strings. That is expected, not an error case.

### Output

Returned as `structuredContent` against a declared output schema, plus a plain-text summary in
`content` for clients that ignore structured output.

```json
{
  "supported": true,
  "country": "Nigeria",
  "code": "NG",
  "status": "live",
  "region": "West Africa",
  "currency": { "code": "NGN", "symbol": "₦", "minorUnits": 2 },
  "products": [
    {
      "id": "virtual-usd-card",
      "name": "Virtual USD Card",
      "status": "live",
      "description": "Instantly issued virtual card denominated in USD…",
      "note": "Primary demand driver: USD spend on global services."
    }
  ],
  "funding": [
    {
      "id": "bank-transfer",
      "name": "Bank Transfer",
      "status": "live",
      "description": "Push funds from a local bank account…",
      "note": "NIP instant transfer, settles in seconds."
    }
  ],
  "notes": "High demand for USD-denominated spend…"
}
```

| Field | Notes |
| --- | --- |
| `supported` | True when market `status` is `live` or `beta` |
| `country` / `code` | `null` when the country has no market file |
| `status` | `live` \| `beta` \| `waitlist` \| `unsupported` \| `unknown` |
| `products` / `funding` | Catalog entries resolved to full name and description, with per-market status |
| `reason` | Present only when `supported` is false — explains why, and lists where we do operate |
| `notes` | Optional behavioural context from the market file |

### Unsupported country

An unconfigured country is **a valid answer, not an error**. `isError` stays false:

```json
{
  "supported": false,
  "country": null,
  "code": null,
  "status": "unknown",
  "products": [],
  "funding": [],
  "reason": "GetPlu has no market configured for \"Iceland\". Supported today: Argentina (AR), Kenya (KE), Nigeria (NG), Philippines (PH), Singapore (SG)."
}
```

This matters: a tool error makes an assistant apologise and stop. A structured negative lets it say
*"not yet in Iceland, but here's where we are."*

### Data sources

`data/markets/<code>.json` joined against `data/catalog/products.json` and
`data/catalog/funding.json`. See [COUNTRY_MATRIX.md](COUNTRY_MATRIX.md).

---

## `get_api_status` ✅

Check whether the GetPlu API itself is up. Takes no arguments.

**Annotations:** `readOnlyHint: true`, `openWorldHint: true` (it touches the network).

Calls `GET https://api.getplu.com/api/health` — the one PLU API endpoint that needs no
credentials, which makes it the honest end-to-end reachability check.

```json
{
  "reachable": true,
  "endpoint": "https://api.getplu.com",
  "status": "ok",
  "service": "plu-web-api",
  "version": "1.0.0",
  "latencyMs": 213
}
```

An unreachable API returns `reachable: false` with a `reason` and `isError: false`. A down
dependency is a fact to report, not a tool failure — the assistant should be able to say "GetPlu is
having trouble right now" rather than apologise for a broken tool.

---

## The PLU API

Base URL `https://api.getplu.com`. OpenAPI 3.0.3 spec is published at
[`/docs/json`](https://api.getplu.com/docs/json) with Swagger UI at `/docs`. 71 paths across auth,
profile, KYC, cards, transactions, ledger, orders, notifications, subscriptions, and admin.

Failures use a consistent envelope, which `PluApi` maps to `PluApiError`:

```json
{ "success": false, "error": { "message": "Authentication required", "code": "UNAUTHORIZED" } }
```

Two facts that shape everything after stage 1:

**There is no market or country endpoint.** `market` appears zero times in the spec. `country_code`
appears five times, always as an attribute *of a user* (auth session, profile address, KYC details)
— never as "which countries does GetPlu serve". Market availability therefore stays in
`data/markets/` until such an endpoint exists.

**Auth is user-session based, not machine-to-machine.** `POST /api/auth/session` takes a
`user_id`/`email`/`wallet_address` and returns a token for *that user*. There is no documented
service credential an MCP server could carry on its own behalf. Resolving this is a prerequisite for
pipeline stage 5, not a detail of it.

---

## Planned tools

Tracking the pipeline in [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Names and shapes are proposals, not
commitments.

| Stage | Tool | Returns | Auth |
| --- | --- | --- | --- |
| — | `get_api_status` ✅ | GetPlu API health | none |
| 1 country | `get_market` ✅ | Market availability | none |
| 2 intent | `resolve_intent` | Ranked intents from conversation text | none |
| 3 product | `recommend_product` | Ranked products with a reason each | none |
| 4 localized UI | `get_product_view` | UI description — copy, currency, steps | none |
| 5 onboarding | `start_onboarding` | Resumable session + handoff link | **required** |
| 6 attribution | *(envelope on every call)* | — | required |

**The auth boundary sits between stage 4 and stage 5.** Everything up to localized UI is read-only,
stateless, and needs no credentials — which is why those stages can ship quickly. Stage 5 is the
first write, the first secret, and the first database.

---

## Conventions for a new tool

1. **One module per domain** in `src/tools/`, registered from `src/tools/index.ts`. Never register
   tools directly in `server.ts`.
2. **Wrap the handler in `guard()`** from `src/tools/result.ts` so a thrown error becomes an
   `isError` result instead of killing the server.
3. **Declare an `outputSchema`** and return `structuredContent`. Also return a text summary — not
   every client reads structured output.
4. **Annotate honestly.** `readOnlyHint` for reads, `destructiveHint` for anything irreversible.
   Assistants use these to decide whether to confirm with the user first.
5. **Describe inputs for a model, not a developer.** The `description` is a prompt. Say what a valid
   value looks like and give an example.
6. **Prefer a structured negative over an error.** "Not available here, and here's why" beats a
   failure the model has to interpret.
7. **No country logic in code.** If you need per-market behaviour, add a field to the market schema
   and read it. A `switch (country)` is a design failure.
8. **Add a case to `tests/server.test.ts`**, driving the real server over an in-memory transport.

## Verifying by hand

```bash
MCP_TRANSPORT=http PORT=8787 npm start

curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_market","arguments":{"country":"NG"}}}'
```

`initialize` and `tools/list` work the same way. `npm test` covers all of this plus registry
validation — 18 cases.

## Connecting ChatGPT

1. Run with `MCP_TRANSPORT=http` behind HTTPS (`ngrok http 8787` for a quick test).
2. ChatGPT → **Settings → Connectors → Create**, pointing at the `/mcp` URL.
3. Enable it in a conversation and ask *"Does GetPlu work in Nigeria?"*

## Connecting Claude

```bash
claude mcp add getplu -- node /absolute/path/to/getplu-mcp/dist/server.js
```
