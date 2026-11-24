import * as z from "zod/v4";
import { ESTIMATE_LINE, percent, usd } from "./display.js";
import { MAX_DOLLARS, roundMoney, roundPercent } from "./money.js";

export const sellerNetInputSchema = z.object({
  salePrice: z.number().finite().positive().max(MAX_DOLLARS).describe("Sale price in dollars."),
  mortgagePayoff: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Remaining mortgage payoff in dollars. Use 0 if the home is owned free and clear."),
  commissionPercent: z
    .number()
    .finite()
    .min(0)
    .max(20)
    .describe("Total commission as a percent of the sale price. 5.5 means 5.5 percent."),
  closingCosts: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Other seller closing costs in dollars, excluding commission. Defaults to 0.")
    .default(0),
  concessions: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Seller concessions or credits to the buyer, in dollars. Defaults to 0.")
    .default(0),
});

export const sellerNetOutputSchema = z.object({
  salePrice: z.number(),
  commissionPercent: z.number(),
  commissionAmount: z.number(),
  mortgagePayoff: z.number(),
  closingCosts: z.number(),
  concessions: z.number(),
  estimatedNetProceeds: z
    .number()
    .describe("Sale price minus commission, payoff, closing costs, and concessions. Negative means cash to close."),
  netProceedsPercentOfSale: z.number(),
  sellerBringsCash: z.boolean(),
});

export type SellerNetInput = z.infer<typeof sellerNetInputSchema>;
export type SellerNetOutput = z.infer<typeof sellerNetOutputSchema>;

export function calculateSellerNet(input: SellerNetInput): SellerNetOutput {
  const salePrice = roundMoney(input.salePrice);
  const commissionAmount = roundMoney((salePrice * input.commissionPercent) / 100);
  const mortgagePayoff = roundMoney(input.mortgagePayoff);
  const closingCosts = roundMoney(input.closingCosts);
  const concessions = roundMoney(input.concessions);
  const estimatedNetProceeds = roundMoney(
    salePrice - commissionAmount - mortgagePayoff - closingCosts - concessions,
  );

  return {
    salePrice,
    commissionPercent: input.commissionPercent,
    commissionAmount,
    mortgagePayoff,
    closingCosts,
    concessions,
    estimatedNetProceeds,
    netProceedsPercentOfSale: roundPercent((estimatedNetProceeds / salePrice) * 100),
    sellerBringsCash: estimatedNetProceeds < 0,
  };
}

export function formatSellerNet(result: SellerNetOutput): string {
  return [
    "Seller net sheet estimate",
    "",
    `Sale price: ${usd(result.salePrice)}`,
    `Commission (${percent(result.commissionPercent)}): ${usd(result.commissionAmount)}`,
    `Mortgage payoff: ${usd(result.mortgagePayoff)}`,
    `Closing costs: ${usd(result.closingCosts)}`,
    `Concessions: ${usd(result.concessions)}`,
    `Estimated net proceeds: ${usd(result.estimatedNetProceeds)} (${percent(result.netProceedsPercentOfSale)} of the sale price)`,
    result.sellerBringsCash
      ? "Estimated net is negative, so the seller may need to bring cash to closing."
      : "Estimated net is positive.",
    "",
    "This sheet does not include prorated taxes, repair credits, or transfer taxes unless they were included in closing costs or concessions.",
    ESTIMATE_LINE,
  ].join("\n");
}
