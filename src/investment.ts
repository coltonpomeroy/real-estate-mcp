import * as z from "zod/v4";
import { ESTIMATE_LINE, percent, usd } from "./display.js";
import { monthlyPrincipalAndInterest } from "./mortgage.js";
import { MAX_DOLLARS, roundMoney, roundPercent } from "./money.js";

export const investmentInputSchema = z
  .object({
    purchasePrice: z.number().finite().positive().max(MAX_DOLLARS).describe("Purchase price in dollars."),
    grossAnnualRent: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Yearly scheduled rent in dollars, before vacancy."),
    operatingExpensesAnnual: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe(
        "Yearly operating expenses in dollars: taxes, insurance, repairs, management, utilities you pay, and HOA. Do not include the mortgage.",
      ),
    vacancyPercent: z
      .number()
      .finite()
      .min(0)
      .max(50)
      .describe("Vacancy and credit loss as a percent of gross rent. Defaults to 5.")
      .default(5),
    otherAnnualIncome: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Other yearly income, such as parking or laundry, in dollars. Defaults to 0.")
      .default(0),
    downPayment: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .optional()
      .describe("Cash down payment in dollars. Omit it for an all-cash purchase."),
    annualInterestRate: z
      .number()
      .finite()
      .min(0)
      .max(30)
      .describe("Annual loan rate as a percent, used only when the purchase is financed. Defaults to 0.")
      .default(0),
    termYears: z
      .number()
      .int()
      .min(1)
      .max(40)
      .describe("Loan term in years when the purchase is financed. Defaults to 30.")
      .default(30),
    closingCosts: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Buyer closing costs in dollars, added to cash invested. Defaults to 0.")
      .default(0),
  })
  .refine((value) => value.downPayment === undefined || value.downPayment <= value.purchasePrice, {
    message: "Down payment cannot exceed the purchase price",
    path: ["downPayment"],
  });

export const investmentOutputSchema = z.object({
  purchasePrice: z.number(),
  grossAnnualRent: z.number(),
  vacancyPercent: z.number(),
  vacancyLoss: z.number(),
  otherAnnualIncome: z.number(),
  effectiveGrossIncome: z.number(),
  operatingExpensesAnnual: z.number(),
  netOperatingIncome: z.number().describe("Effective gross income minus operating expenses. The mortgage is not deducted."),
  capRatePercent: z.number().describe("Net operating income divided by purchase price, as a percent."),
  allCash: z.boolean(),
  loanAmount: z.number(),
  annualInterestRate: z.number(),
  termYears: z.number().int(),
  monthlyPrincipalAndInterest: z.number(),
  annualDebtService: z.number(),
  annualCashFlow: z.number().describe("Net operating income minus annual debt service."),
  cashInvested: z.number().describe("Down payment plus closing costs. For all cash, the purchase price plus closing costs."),
  cashOnCashPercent: z
    .number()
    .nullable()
    .describe("Annual cash flow divided by cash invested, as a percent. Null when no cash is invested."),
});

export type InvestmentInput = z.infer<typeof investmentInputSchema>;
export type InvestmentOutput = z.infer<typeof investmentOutputSchema>;

export function calculateInvestment(input: InvestmentInput): InvestmentOutput {
  const purchasePrice = roundMoney(input.purchasePrice);
  const grossAnnualRent = roundMoney(input.grossAnnualRent);
  const vacancyLoss = roundMoney((grossAnnualRent * input.vacancyPercent) / 100);
  const otherAnnualIncome = roundMoney(input.otherAnnualIncome);
  const effectiveGrossIncome = roundMoney(grossAnnualRent - vacancyLoss + otherAnnualIncome);
  const operatingExpensesAnnual = roundMoney(input.operatingExpensesAnnual);
  const netOperatingIncome = roundMoney(effectiveGrossIncome - operatingExpensesAnnual);
  const capRatePercent = roundPercent((netOperatingIncome / purchasePrice) * 100);

  const allCash = input.downPayment === undefined;
  const downPayment = roundMoney(input.downPayment ?? purchasePrice);
  const loanAmount = roundMoney(purchasePrice - downPayment);
  const monthlyDebt =
    loanAmount > 0
      ? monthlyPrincipalAndInterest(loanAmount, input.annualInterestRate, input.termYears * 12)
      : 0;
  const annualDebtService = roundMoney(monthlyDebt * 12);
  const annualCashFlow = roundMoney(netOperatingIncome - annualDebtService);
  const closingCosts = roundMoney(input.closingCosts);
  const cashInvested = roundMoney(downPayment + closingCosts);
  const cashOnCashPercent =
    cashInvested > 0 ? roundPercent((annualCashFlow / cashInvested) * 100) : null;

  return {
    purchasePrice,
    grossAnnualRent,
    vacancyPercent: input.vacancyPercent,
    vacancyLoss,
    otherAnnualIncome,
    effectiveGrossIncome,
    operatingExpensesAnnual,
    netOperatingIncome,
    capRatePercent,
    allCash,
    loanAmount,
    annualInterestRate: loanAmount > 0 ? input.annualInterestRate : 0,
    termYears: input.termYears,
    monthlyPrincipalAndInterest: monthlyDebt,
    annualDebtService,
    annualCashFlow,
    cashInvested,
    cashOnCashPercent,
  };
}

export function formatInvestment(result: InvestmentOutput): string {
  const cashOnCash =
    result.cashOnCashPercent === null
      ? "Cash-on-cash return is undefined because no cash is invested."
      : `Cash-on-cash return: ${percent(result.cashOnCashPercent)}`;

  return [
    "Rental return estimate",
    "",
    `Purchase price: ${usd(result.purchasePrice)}`,
    `Gross rent: ${usd(result.grossAnnualRent)}`,
    `Vacancy loss (${percent(result.vacancyPercent)}): ${usd(result.vacancyLoss)}`,
    `Other income: ${usd(result.otherAnnualIncome)}`,
    `Effective gross income: ${usd(result.effectiveGrossIncome)}`,
    `Operating expenses: ${usd(result.operatingExpensesAnnual)}`,
    `Net operating income: ${usd(result.netOperatingIncome)}`,
    `Cap rate: ${percent(result.capRatePercent)}`,
    "",
    result.allCash ? "Financing: all cash" : `Loan amount: ${usd(result.loanAmount)}`,
    `Annual debt service: ${usd(result.annualDebtService)}`,
    `Annual cash flow: ${usd(result.annualCashFlow)}`,
    `Cash invested: ${usd(result.cashInvested)}`,
    cashOnCash,
    "",
    "Cap rate ignores the loan. Cash-on-cash uses cash flow after principal and interest. Operating expenses should not include the mortgage.",
    ESTIMATE_LINE,
  ].join("\n");
}
