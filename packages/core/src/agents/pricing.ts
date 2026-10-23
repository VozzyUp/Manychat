import { z } from 'zod';

/** USD per million tokens, by model id exactly as in the LLM_MODEL_* variables. */
const priceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  /** Default: 10% of input. */
  cache_read: z.number().nonnegative().optional(),
  /** Default: 125% of input. */
  cache_write: z.number().nonnegative().optional(),
});
const pricingSchema = z.record(z.string(), priceSchema);
export type Pricing = z.infer<typeof pricingSchema>;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Parses LLM_PRICING (JSON). Empty means "unknown": costs are recorded as 0. */
export function parsePricing(raw: string | undefined): Pricing {
  if (!raw?.trim()) return {};
  return pricingSchema.parse(JSON.parse(raw));
}

/** Estimated cost of one call in USD (§ custos). Unknown model → 0. */
export function costUsd(pricing: Pricing, model: string, usage: Usage): number {
  const price = pricing[model];
  if (!price) return 0;
  const readPrice = price.cache_read ?? price.input * 0.1;
  const writePrice = price.cache_write ?? price.input * 1.25;
  const total =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * readPrice +
    usage.cacheWriteTokens * writePrice;
  return Math.round((total / 1_000_000) * 1e6) / 1e6;
}

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export function addUsage(total: Usage, add: Usage): void {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  total.cacheReadTokens += add.cacheReadTokens;
  total.cacheWriteTokens += add.cacheWriteTokens;
}
