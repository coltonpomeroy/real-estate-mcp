import * as z from "zod/v4";
import { ESTIMATE_LINE, percent, usd } from "./display.js";
import { monthlyPrincipalAndInterest } from "./mortgage.js";
import { MAX_DOLLARS, fromCents, roundMoney, roundPercent, toCents } from "./money.js";

export const affordabilityInputSchema = z
  .object({
    annualGrossIncome: z
      .number()
      .finite()
      .positive()
      .max(MAX_DOLLARS)
      .describe("Gross yearly income in dollars, before taxes."),
    monthlyDebtPayments: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Monthly debt payments other than the new mortgage, such as auto and student loans. Defaults to 0.")
      .default(0),
    downPayment: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Cash down payment in dollars. Defaults to 0.")
      .default(0),
    annualInterestRate: z
      .number()
      .finite()
      .min(0)
      .max(30)
      .describe("Annual mortgage rate as a percent. 6.5 means 6.5 percent."),
    termYears: z.number().int().min(1).max(40).describe("Loan term in years, from 1 to 40."),
    maxFrontEndDtiPercent: z
      .number()
      .finite()
      .min(1)
      .max(80)
      .describe("Maximum housing payment as a percent of gross monthly income. Defaults to 28.")
      .default(28),
    maxBackEndDtiPercent: z
      .number()
      .finite()
      .min(1)
      .max(80)
      .describe(
        "Maximum housing payment plus other debts, as a percent of gross monthly income. Defaults to 36.",
      )
      .default(36),
    annualPropertyTaxRate: z
      .number()
      .finite()
      .min(0)
      .max(10)
      .describe("Yearly property tax as a percent of the home price. 1.1 means 1.1 percent. Defaults to 0.")
      .default(0),
    annualInsuranceRate: z
      .number()
      .finite()
      .min(0)
      .max(10)
      .describe(
        "Yearly homeowners insurance as a percent of the home price. 0.35 means 0.35 percent. Defaults to 0.",
      )
      .default(0),
    monthlyHoa: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Monthly HOA dues in dollars. Defaults to 0.")
      .default(0),
    annualPmiRate: z
      .number()
      .finite()
      .min(0)
      .max(5)
      .describe(
        "Yearly PMI as a percent of the loan amount, charged only when the loan is above 80 percent of the price. 0.5 means 0.5 percent. Defaults to 0.",
      )
      .default(0),
  })
  .refine((value) => value.maxBackEndDtiPercent + 1e-9 >= value.maxFrontEndDtiPercent, {
    message: "Back-end DTI limit must be at least the front-end DTI limit",
    path: ["maxBackEndDtiPercent"],
  });

const bindingSchema = z.enum(["front_end_dti", "back_end_dti", "both", "insufficient_income"]);

export const affordabilityOutputSchema = z.object({
  maxHomePrice: z.number().describe("Highest price whose housing payment fits the tighter DTI limit."),
  maxLoanAmount: z.number(),
  downPayment: z.number(),
  monthlyGrossIncome: z.number(),
  housingAllowance: z.number().describe("Monthly housing payment allowed by the tighter DTI limit."),
  bindingConstraint: bindingSchema,
  totalMonthlyPayment: z.number(),
  monthlyPrincipalAndInterest: z.number(),
  monthlyPropertyTax: z.number(),
  monthlyInsurance: z.number(),
  monthlyHoa: z.number(),
  monthlyPmi: z.number(),
  frontEndDtiPercent: z.number().describe("Housing payment divided by gross monthly income, as a percent."),
  backEndDtiPercent: z
    .number()
    .describe("Housing payment plus other debts, divided by gross monthly income, as a percent."),
  loanToValuePercent: z.number(),
  pmiApplied: z.boolean(),
  annualInterestRate: z.number(),
  termYears: z.number().int(),
});

export type AffordabilityInput = z.infer<typeof affordabilityInputSchema>;
export type AffordabilityOutput = z.infer<typeof affordabilityOutputSchema>;

interface HousingAtPrice {
  totalCents: number;
  principalAndInterestCents: number;
  taxCents: number;
  insuranceCents: number;
  hoaCents: number;
  pmiCents: number;
  loanCents: number;
  pmiApplied: boolean;
}

function housingAtPrice(priceCents: number, input: AffordabilityInput): HousingAtPrice {
  const downCents = toCents(input.downPayment);
  const loanCents = Math.max(0, priceCents - downCents);
  const pmiApplied = priceCents > 0 && loanCents * 5 > priceCents * 4 && input.annualPmiRate > 0;
  const principalAndInterestCents =
    loanCents > 0
      ? toCents(
          monthlyPrincipalAndInterest(
            loanCents / 100,
            input.annualInterestRate,
            input.termYears * 12,
          ),
        )
      : 0;
  const taxCents = Math.round((priceCents * input.annualPropertyTaxRate) / 100 / 12);
  const insuranceCents = Math.round((priceCents * input.annualInsuranceRate) / 100 / 12);
  const hoaCents = toCents(input.monthlyHoa);
  const pmiCents = pmiApplied ? Math.round((loanCents * input.annualPmiRate) / 100 / 12) : 0;
  return {
    totalCents: principalAndInterestCents + taxCents + insuranceCents + hoaCents + pmiCents,
    principalAndInterestCents,
    taxCents,
    insuranceCents,
    hoaCents,
    pmiCents,
    loanCents,
    pmiApplied,
  };
}

function bindingFor(
  frontCapCents: number,
  backCapCents: number,
): AffordabilityOutput["bindingConstraint"] {
  if (frontCapCents <= 0 || backCapCents <= 0) {
    return "insufficient_income";
  }
  if (frontCapCents < backCapCents) {
    return "front_end_dti";
  }
  if (backCapCents < frontCapCents) {
    return "back_end_dti";
  }
  return "both";
}

export function calculateAffordability(input: AffordabilityInput): AffordabilityOutput {
  const monthlyIncomeCents = Math.round(toCents(input.annualGrossIncome) / 12);
  const debtCents = toCents(input.monthlyDebtPayments);
  const frontCapCents = Math.round((monthlyIncomeCents * input.maxFrontEndDtiPercent) / 100);
  const backCapCents = Math.round((monthlyIncomeCents * input.maxBackEndDtiPercent) / 100) - debtCents;
  const bindingConstraint = bindingFor(frontCapCents, backCapCents);
  const allowanceCents = Math.max(0, Math.min(frontCapCents, backCapCents));
  const termMonths = input.termYears * 12;
  const upper = toCents(input.downPayment) + allowanceCents * termMonths;

  let best = 0;
  let low = 0;
  let high = upper;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (housingAtPrice(mid, input).totalCents <= allowanceCents) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const housing = housingAtPrice(best, input);
  const ratio = (numerator: number): number =>
    monthlyIncomeCents === 0 ? 0 : roundPercent((numerator / monthlyIncomeCents) * 100);

  return {
    maxHomePrice: fromCents(best),
    maxLoanAmount: fromCents(housing.loanCents),
    downPayment: roundMoney(input.downPayment),
    monthlyGrossIncome: fromCents(monthlyIncomeCents),
    housingAllowance: fromCents(allowanceCents),
    bindingConstraint,
    totalMonthlyPayment: fromCents(housing.totalCents),
    monthlyPrincipalAndInterest: fromCents(housing.principalAndInterestCents),
    monthlyPropertyTax: fromCents(housing.taxCents),
    monthlyInsurance: fromCents(housing.insuranceCents),
    monthlyHoa: fromCents(housing.hoaCents),
    monthlyPmi: fromCents(housing.pmiCents),
    frontEndDtiPercent: ratio(housing.totalCents),
    backEndDtiPercent: ratio(housing.totalCents + debtCents),
    loanToValuePercent: best === 0 ? 0 : roundPercent((housing.loanCents / best) * 100),
    pmiApplied: housing.pmiApplied,
    annualInterestRate: input.annualInterestRate,
    termYears: input.termYears,
  };
}

export function formatAffordability(result: AffordabilityOutput): string {
  const constraintText: Record<AffordabilityOutput["bindingConstraint"], string> = {
    front_end_dti: "The front-end DTI limit sets the housing allowance.",
    back_end_dti: "The back-end DTI limit sets the housing allowance.",
    both: "The front-end and back-end DTI limits set the same housing allowance.",
    insufficient_income:
      "Debts or a very low income leave no room for a housing payment under these DTI limits.",
  };

  return [
    "Affordability estimate",
    "",
    `Maximum home price: ${usd(result.maxHomePrice)}`,
    `Loan amount: ${usd(result.maxLoanAmount)}`,
    `Down payment: ${usd(result.downPayment)}`,
    `Loan to value: ${percent(result.loanToValuePercent)}`,
    `Monthly gross income: ${usd(result.monthlyGrossIncome)}`,
    `Housing allowance: ${usd(result.housingAllowance)}`,
    constraintText[result.bindingConstraint],
    "",
    `Principal and interest: ${usd(result.monthlyPrincipalAndInterest)}`,
    `Property tax: ${usd(result.monthlyPropertyTax)}`,
    `Insurance: ${usd(result.monthlyInsurance)}`,
    `HOA: ${usd(result.monthlyHoa)}`,
    `PMI: ${usd(result.monthlyPmi)}`,
    `Total monthly housing payment: ${usd(result.totalMonthlyPayment)}`,
    `Front-end DTI at this price: ${percent(result.frontEndDtiPercent)}`,
    `Back-end DTI at this price: ${percent(result.backEndDtiPercent)}`,
    result.pmiApplied
      ? "PMI is included because the loan is above 80 percent of the price."
      : "PMI is not included.",
    "",
    "Property tax and insurance, when provided, are percents of the home price. A result that leaves them at zero is a principal-and-interest estimate and will be high compared with a full housing payment.",
    ESTIMATE_LINE,
  ].join("\n");
}
