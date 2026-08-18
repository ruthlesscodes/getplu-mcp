import { z } from "zod";

/**
 * The contract every market file must satisfy.
 *
 * Adding a country means adding one JSON file under `data/markets/` that
 * validates against `marketSchema` — no code changes. The registry loads the
 * directory at startup and fails loudly if a file is malformed or references a
 * product or funding method that does not exist in the catalogs.
 */

/** Rollout state. `live` and `beta` are considered supported; the rest are not. */
export const availabilitySchema = z.enum(["live", "beta", "waitlist", "unsupported"]);
export type Availability = z.infer<typeof availabilitySchema>;

export const SUPPORTED_STATES: readonly Availability[] = ["live", "beta"];

export function isSupported(status: Availability): boolean {
  return SUPPORTED_STATES.includes(status);
}

export const productDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  category: z.enum(["card", "funding", "payout", "account"]),
  description: z.string().min(1),
});
export type ProductDefinition = z.infer<typeof productDefinitionSchema>;

export const fundingDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** How money physically arrives. Drives copy and expected settlement time. */
  rail: z.enum(["bank-transfer", "mobile-money", "ewallet", "card", "crypto", "cash"]),
  description: z.string().min(1),
});
export type FundingDefinition = z.infer<typeof fundingDefinitionSchema>;

/** A product or funding method as offered in one specific market. */
export const marketOfferingSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  status: availabilitySchema.default("live"),
  note: z.string().optional(),
});
export type MarketOffering = z.infer<typeof marketOfferingSchema>;

export const marketSchema = z.object({
  /** ISO 3166-1 alpha-2, uppercase. Doubles as the file name. */
  code: z.string().regex(/^[A-Z]{2}$/),
  iso3: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1),
  /** Extra spellings users and models may pass, e.g. "Naija", "PHL", "+234". */
  aliases: z.array(z.string().min(1)).default([]),
  region: z.string().min(1),
  status: availabilitySchema,
  currency: z.object({
    code: z.string().regex(/^[A-Z]{3}$/),
    symbol: z.string().min(1),
    minorUnits: z.number().int().min(0).max(4).default(2),
  }),
  locale: z.object({
    languages: z.array(z.string().min(2)).min(1),
    timezone: z.string().min(1),
    callingCode: z.string().regex(/^\+\d{1,4}$/),
  }),
  /** Per-country marketing page. Optional until the localized pages exist. */
  landingPage: z.url().optional(),
  products: z.array(marketOfferingSchema).default([]),
  funding: z.array(marketOfferingSchema).default([]),
  compliance: z
    .object({
      kycRequired: z.boolean().default(true),
      /** Free-form tier labels; the framework does not interpret them. */
      tiers: z.array(z.string()).default([]),
      regulator: z.string().optional(),
    })
    .default({ kycRequired: true, tiers: [] }),
  notes: z.string().optional(),
});
export type Market = z.infer<typeof marketSchema>;
