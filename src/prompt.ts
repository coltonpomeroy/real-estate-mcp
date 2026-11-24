import * as z from "zod/v4";

export const compareOffersArgsSchema = z.object({
  salePriceA: z.string().describe("Sale price of offer A in dollars, such as 450000."),
  salePriceB: z.string().describe("Sale price of offer B in dollars, such as 445000."),
  concessionsA: z
    .string()
    .optional()
    .describe("Seller concessions for offer A in dollars. Omit or use 0 if there are none."),
  concessionsB: z
    .string()
    .optional()
    .describe("Seller concessions for offer B in dollars. Omit or use 0 if there are none."),
  mortgagePayoff: z.string().describe("Remaining mortgage payoff in dollars, shared by both offers."),
  commissionPercent: z
    .string()
    .describe("Total commission as a percent of the sale price, such as 5.5."),
  closingCosts: z
    .string()
    .describe("Other seller closing costs in dollars, excluding commission. Shared by both offers."),
});

export type CompareOffersArgs = z.infer<typeof compareOffersArgsSchema>;

export function compareOffersText(args: CompareOffersArgs): string {
  const concessionsA = args.concessionsA ?? "0";
  const concessionsB = args.concessionsB ?? "0";
  return [
    "Compare these two offers for a home seller and say which one leaves more estimated net proceeds.",
    "Call the seller_net_sheet tool once for each offer. Use the tool results for the math.",
    "",
    "Shared assumptions:",
    `Mortgage payoff: ${args.mortgagePayoff} dollars`,
    `Commission: ${args.commissionPercent} percent of the sale price`,
    `Other closing costs: ${args.closingCosts} dollars`,
    "",
    "Offer A:",
    `Sale price: ${args.salePriceA} dollars`,
    `Seller concessions: ${concessionsA} dollars`,
    "",
    "Offer B:",
    `Sale price: ${args.salePriceB} dollars`,
    `Seller concessions: ${concessionsB} dollars`,
    "",
    "In the reply, show each offer's estimated net proceeds, the dollar difference, and which offer nets more.",
    "List commission and concessions as their own lines.",
    "Close by reminding the seller that these figures are estimates and a title company should confirm them before they rely on the comparison.",
  ].join("\n");
}
