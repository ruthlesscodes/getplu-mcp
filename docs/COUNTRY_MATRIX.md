# Country Matrix

Five launch markets. They exist to keep the framework honest — each one breaks an assumption the
others would let us get away with.

> **Source of truth is `data/markets/*.json`, not this file.** This table is a human-readable view.
> If the two disagree, the JSON is right and this file is stale.

> ⚠️ **Availability data needs confirmation.** Currencies, calling codes, timezones, and regulators
> are factual. The per-product and per-funding **statuses below are placeholders** written to
> exercise the framework — they have not been confirmed against GetPlu's actual licensing and
> partner coverage. Correct `data/markets/*.json` before any of this reaches a user.

## The matrix

| Country | Supported | Language | Currency | Funding | Products | Landing page |
| --- | --- | --- | --- | --- | --- | --- |
| 🇳🇬 Nigeria | ✓ live | EN | NGN ₦ | Bank transfer (NIP), Stablecoin, Debit card ᵇ | USD card, Local card, Stablecoin wallet, Payout | — |
| 🇰🇪 Kenya | ✓ live | EN, SW | KES KSh | **Mobile money (M-Pesa)**, Bank transfer, Stablecoin | USD card, Local card, Stablecoin wallet, Payout | — |
| 🇦🇷 Argentina | ✓ beta | ES | ARS $ | **Stablecoin (USDT)**, Bank transfer ᵇ, E-wallet ᵇ | USD card ᵇ, Stablecoin wallet, Payout ᵇ | — |
| 🇵🇭 Philippines | ✓ beta | EN, FIL | PHP ₱ | **E-wallet (GCash, Maya)**, Bank transfer, Stablecoin ᵇ | USD card ᵇ, Local card ᵇ, Stablecoin wallet, Payout | — |
| 🇸🇬 Singapore | ✓ live | EN | SGD S$ | Bank transfer (PayNow), Debit card, Stablecoin | USD card, Local card, **Physical card**, Stablecoin wallet, Payout | — |

**ᵇ** = beta. **Bold** = the market's primary rail or its distinguishing product.
Products shown are `live` or `beta` only; `waitlist` items are omitted (Physical Card and Agent Card
are on the waitlist everywhere except Singapore's physical card).

**Landing page** is a new optional `landingPage` field in the market schema. No URLs are configured
yet — filling the column is a one-line data change per country, no code.

## Why these five

| Market | Breaks the assumption that… |
| --- | --- |
| Nigeria | …local card rails work internationally. They don't — that *is* the product. |
| Kenya | …bank transfer is the default funding path. M-Pesa is primary, banks secondary. |
| Argentina | …people want a card. They want dollars; the card is the delivery mechanism. |
| Philippines | …e-wallets are a fallback. GCash/Maya penetration far exceeds cards. |
| Singapore | …access is the problem. It isn't — settlement speed and agent spend are. |

Any framework that handles this set handles most of the long tail. That is the entire point of
picking five instead of building 125.

## Per-market notes

### 🇳🇬 Nigeria — `data/markets/ng.json`
Status `live`. Regulator: Central Bank of Nigeria. KYC: BVN, NIN, address proof.
Demand is driven by USD-denominated spend on global services; domestic cards are frequently
rejected by international merchants. NIP transfer settles in seconds and is the default funding
path. Cash-agent funding is on the waitlist.

### 🇰🇪 Kenya — `data/markets/ke.json`
Status `live`. Regulator: Central Bank of Kenya. KYC: national ID, KRA PIN.
Mobile-money-first: M-Pesa is the default funding path, not the fallback, and payouts land back in
an M-Pesa wallet. Any flow that assumes a bank account as the primary rail is wrong here.

### 🇦🇷 Argentina — `data/markets/ar.json`
Status `beta`. Regulator: BCRA. KYC: CUIT/CUIL, address proof. Only Spanish-language market.
Inflation drives demand for dollar *balances*; USDT is the dominant on-ramp and bank transfer
(CBU/CVU) is secondary. FX controls make local card rails restrictive — the stablecoin wallet is
`live` while the USD card is still `beta`, which is the inverse of every other market.

### 🇵🇭 Philippines — `data/markets/ph.json`
Status `beta`. Regulator: Bangko Sentral ng Pilipinas. KYC: PhilSys ID, selfie match.
Remittance-heavy. E-wallet penetration is far ahead of card penetration, so GCash/Maya funding is
`live` while both card products are still `beta`.

### 🇸🇬 Singapore — `data/markets/sg.json`
Status `live`. Regulator: MAS. KYC: SingPass, MyInfo.
The only market where physical cards are `live` and the only one where access is not the problem.
The differentiator is stablecoin settlement and agent spend, not availability. Heaviest regulatory
scrutiny of the five.

## Adding a country

1. Create `data/markets/<code>.json` — lowercase ISO alpha-2 filename.
2. Reference product and funding ids that already exist in `data/catalog/`.
3. Restart. No code change, no build change.
4. Update this table (or accept that it drifts — the JSON is authoritative).

The registry validates every file at startup and refuses to boot on a bad one, naming the file, the
field, and the fix. Referencing a product that isn't in the catalog is an error, not a silently
empty list.

New products or funding rails are added **once** to `data/catalog/products.json` or
`funding.json`, then reused by every market by id. That is what stops market #125 from becoming a
copy-paste of market #1.

## Field reference

| Field | Notes |
| --- | --- |
| `code` / `iso3` | ISO 3166 alpha-2 (uppercase, matches filename) and alpha-3 |
| `name` / `aliases` | Aliases catch what users and models actually type (`Naija`, `Pilipinas`) |
| `status` | `live` \| `beta` \| `waitlist` \| `unsupported` — first two count as supported |
| `currency` | Code, symbol, minor units |
| `locale` | Languages (primary first), IANA timezone, calling code — calling codes resolve too |
| `landingPage` | Optional per-country marketing URL |
| `products` / `funding` | Catalog ids with a per-market `status` and optional `note` |
| `compliance` | `kycRequired`, tier labels, regulator |
| `notes` | Free text — behavioural context for whoever reads the file next |

Full schema: [`src/markets/schema.ts`](../src/markets/schema.ts). Tool contract:
[MCP_TOOLS.md](MCP_TOOLS.md). Roadmap: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).
