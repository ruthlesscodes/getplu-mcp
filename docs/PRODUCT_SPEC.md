# GetPlu MCP — Product Spec

## Thesis

A person asks an AI assistant *"how do I get paid in dollars from Nigeria?"* — and GetPlu answers,
inside that conversation, with the right product for their country, in their language, with a
signup link that is attributed back to the conversation that produced it.

The assistant is the distribution channel. MCP is the wire.

## The pipeline

```
country  →  intent  →  product  →  localized UI  →  onboarding  →  attribution
```

Each stage narrows ambiguity. Each stage is a separate MCP tool. Each stage is driven by
configuration files, not branching code.

| # | Stage | Question it answers | Status |
| --- | --- | --- | --- |
| 1 | **country** | Do we operate here at all? | ✅ shipped — `get_market` |
| 2 | **intent** | What is this person actually trying to do? | ⬜ next |
| 3 | **product** | Which product solves that, here? | ⬜ |
| 4 | **localized UI** | What does that look like in their language and currency? | ⬜ |
| 5 | **onboarding** | What do they have to do to get it? | ⬜ |
| 6 | **attribution** | Which conversation produced this signup? | ⬜ |

## The one rule

> Adding the 6th, 20th, or 125th country is a data change, not a code rewrite.

This holds for every stage, not just stage 1. If implementing a stage requires a
`switch (country)` anywhere, the design is wrong. Country-specific behaviour lives in
`data/`, is validated against a schema at startup, and is referenced by id.

Five markets exist today (see [COUNTRY_MATRIX.md](COUNTRY_MATRIX.md)) purely to keep the framework
honest. They were chosen because they disagree with each other: mobile-money-first vs bank-first,
inflation-hedge vs remittance vs mature-card, light-touch vs heavily regulated. A framework that
handles those five handles most of the long tail.

---

## Stage 1 — country ✅

**Tool:** `get_market(country)` → `{ supported, country, products, funding, ... }`

Resolves an ISO code, ISO3, country name, alias, or calling code to a market configuration. An
unconfigured country returns `supported: false` with a reason — never an error.

Data: `data/markets/<code>.json`, `data/catalog/products.json`, `data/catalog/funding.json`.

Full contract in [MCP_TOOLS.md](MCP_TOOLS.md).

---

## Stage 2 — intent ⬜

A country alone doesn't tell you what to offer. A Nigerian freelancer receiving Upwork payments and
a Nigerian developer paying for Claude API need different products from the same market.

**Proposed tool:** `resolve_intent(text, country?)` → ranked intents with confidence.

**Proposed data:** `data/catalog/intents.json`

```json
{
  "id": "spend-usd-online",
  "name": "Pay for international services",
  "description": "Subscribe to or pay for software, ads, and APIs priced in USD.",
  "signals": ["pay for", "subscription", "api credits", "ads account", "declined card"]
}
```

Candidate intents: `spend-usd-online`, `receive-foreign-income`, `hold-dollars`, `send-money-home`,
`business-spend`, `agent-spend`.

**Design note:** intents are global; their *availability* is per-market. `hold-dollars` is the
headline intent in Argentina and a minor one in Singapore. That ranking belongs in the market file,
not in code.

**Open question:** does the model classify intent from conversation text, or do we expose the intent
list and let the model pick? Exposing the list is cheaper, more auditable, and keeps the taxonomy
under our control. Recommend starting there.

---

## Stage 3 — product ⬜

**Proposed tool:** `recommend_product(country, intent)` → ranked products with a reason per product.

This is a join across data that already exists: market × intent × product availability. The output
must carry *why*, because the assistant has to explain the recommendation in its own words:

```json
{
  "product": "virtual-usd-card",
  "rank": 1,
  "reason": "Funded by NIP bank transfer in seconds; works on merchants that reject Nigerian cards.",
  "requires": ["bvn"],
  "funding": ["bank-transfer", "stablecoin"]
}
```

**Design note:** ranking rules are data (`weights` per market), not a hardcoded sort. A market
launching a new priority product should not require a deploy.

---

## Stage 4 — localized UI ⬜

**Proposed tool:** `get_product_view(country, product, locale?)` → a UI *description*, not HTML.

Return structured content the client renders: headline, currency-formatted amounts, funding steps
in the local rail's vocabulary ("M-Pesa" in Kenya, "NIP transfer" in Nigeria, "PayNow" in
Singapore), and required documents named as the user knows them ("BVN", "PhilSys ID", "SingPass").

**Design note:** localization is more than translation. `data/markets/*.json` already carries
`locale.languages`, `currency.symbol`, and `compliance.tiers` — the vocabulary problem is a data
problem. Copy bundles belong in `data/copy/<locale>.json`, keyed by string id.

**Boundary:** everything up to and including this stage is **read-only, stateless, and
unauthenticated**. No accounts, no secrets, no database. That is why stages 1–4 can ship fast.

---

## Stage 5 — onboarding ⬜

The first stage that writes. Therefore the first that needs authentication, a real GetPlu API
credential, and a persistence story.

**Proposed tool:** `start_onboarding(country, product, ...)` → a resumable onboarding session and a
link the user opens.

Per-market requirements already live in the market file's `compliance` block (`kycRequired`,
`tiers`, `regulator`). The step *order* and *copy* are data; the verification integrations are not.

**Open questions:**
- Does the MCP server call the GetPlu onboarding API, or hand off to a web flow with a signed link?
  A handoff keeps KYC document capture out of the conversation, which is almost certainly correct
  for a regulated flow.
- Which OAuth model do connectors use for a user's GetPlu account?

---

## Stage 6 — attribution ⬜

If we cannot say which assistant, which conversation, and which country produced a signup, this
channel cannot be justified or optimized.

**Approach:** every tool call carries an attribution envelope — client name and version (available
from the MCP `initialize` handshake), connector id, and a generated `ref` that is threaded into any
link the tools return. The `ref` survives into signup and lands in the warehouse.

**Design note:** the MCP handshake already tells us the calling client identifies as ChatGPT vs
Claude vs something else. That is free attribution data we are currently discarding — capturing it
is cheap and should happen when stage 5 lands, not after.

**Requires:** persistence. This is the stage that turns the server from stateless to stateful, so it
should be designed alongside stage 5, not bolted on later.

---

## Deliberately not built

- Beautiful UI
- Agent Card (exists as a `waitlist` catalog row — that is data describing the roadmap, not a feature)
- Authenticated accounts
- Transactions

These stay out until the pipeline above proves itself end to end in a real assistant.

## Definition of done for the foundation

- [x] A single tool returns correct, per-market data over MCP
- [x] Adding a country is a data change, proven by test
- [x] Streamable HTTP transport (ChatGPT cannot use stdio)
- [x] Bad data fails at startup, not in front of a user
- [ ] Deployed behind HTTPS and called successfully from ChatGPT
