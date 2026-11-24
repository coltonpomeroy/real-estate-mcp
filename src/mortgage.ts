import * as z from "zod/v4";
import { ESTIMATE_LINE, percent, usd } from "./display.js";
import { MAX_DOLLARS, fromCents, roundMoney, toCents } from "./money.js";

export const mortgageInputSchema = z.object({
  principal: z
    .number()
    .finite()
    .positive()
    .max(MAX_DOLLARS)
    .describe("Loan amount in dollars."),
  annualInterestRate: z
    .number()
    .finite()
    .min(0)
    .max(30)
    .describe("Annual interest rate as a percent. 6.5 means 6.5 percent."),
  termYears: z
    .number()
    .int()
    .min(1)
    .max(40)
    .describe("Loan term in years, from 1 to 40."),
  annualPropertyTax: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Yearly property tax in dollars. Defaults to 0.")
    .default(0),
  annualInsurance: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Yearly homeowners insurance in dollars. Defaults to 0.")
    .default(0),
  monthlyHoa: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Monthly HOA dues in dollars. Defaults to 0.")
    .default(0),
  monthlyPmi: z
    .number()
    .finite()
    .min(0)
    .max(MAX_DOLLARS)
    .describe("Monthly private mortgage insurance in dollars. Defaults to 0.")
    .default(0),
});

const paymentSliceSchema = z.object({
  paymentNumber: z.number().int().describe("1-based payment number."),
  principal: z.number().describe("Principal portion of this payment, in dollars."),
  interest: z.number().describe("Interest portion of this payment, in dollars."),
  total: z.number().describe("Principal plus interest for this payment, in dollars."),
  balance: z.number().describe("Remaining balance after this payment, in dollars."),
});

export const mortgageOutputSchema = z.object({
  principal: z.number(),
  annualInterestRate: z.number(),
  termYears: z.number().int(),
  termMonths: z.number().int(),
  monthlyPrincipalAndInterest: z
    .number()
    .describe("Scheduled principal and interest payment. The final payment can differ by a few cents."),
  monthlyPropertyTax: z.number(),
  monthlyInsurance: z.number(),
  monthlyHoa: z.number(),
  monthlyPmi: z.number(),
  totalMonthlyPayment: z.number().describe("Scheduled PITI plus HOA and PMI."),
  totalPrincipal: z.number(),
  totalInterest: z.number(),
  totalOfPayments: z.number().describe("All principal and interest paid over the term."),
  firstPayment: paymentSliceSchema,
  lastPayment: paymentSliceSchema,
});

export type MortgageInput = z.infer<typeof mortgageInputSchema>;
export type MortgageOutput = z.infer<typeof mortgageOutputSchema>;

export interface PaymentSlice {
  paymentNumber: number;
  principal: number;
  interest: number;
  total: number;
  balance: number;
}

export interface Amortization {
  monthlyPrincipalAndInterest: number;
  termMonths: number;
  paymentsMade: number;
  totalPrincipal: number;
  totalInterest: number;
  totalOfPayments: number;
  remainingBalance: number;
  firstPayment: PaymentSlice;
  lastPayment: PaymentSlice;
}

/** Unrounded fully amortizing payment. The caller rounds it to cents. */
export function levelPaymentDollars(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
): number {
  const monthlyRate = annualInterestRate / 100 / 12;
  if (monthlyRate === 0) {
    return principal / termMonths;
  }
  const growth = (1 + monthlyRate) ** termMonths;
  return (principal * monthlyRate * growth) / (growth - 1);
}

export function monthlyPrincipalAndInterest(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
): number {
  if (principal <= 0) {
    return 0;
  }
  return fromCents(toCents(levelPaymentDollars(principal, annualInterestRate, termMonths)));
}

/**
 * Amortize a fixed-rate loan in integer cents.
 * Interest each month is the balance times the monthly rate, rounded to the cent.
 * The scheduled payment is the standard level payment. The final contractual payment
 * pays whatever balance remains, so it can be a few cents higher or lower.
 */
export function amortizeLoan(params: {
  principal: number;
  annualInterestRate: number;
  termMonths: number;
  monthsToRun?: number;
}): Amortization {
  const principalCents = toCents(params.principal);
  if (principalCents <= 0) {
    throw new Error("Principal must be greater than 0");
  }
  if (!Number.isInteger(params.termMonths) || params.termMonths < 1) {
    throw new Error("Term must be a positive whole number of months");
  }

  const paymentCents = toCents(
    levelPaymentDollars(principalCents / 100, params.annualInterestRate, params.termMonths),
  );
  const monthlyRate = params.annualInterestRate / 100 / 12;
  const monthsToRun = Math.min(params.monthsToRun ?? params.termMonths, params.termMonths);

  let balance = principalCents;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let first: PaymentSlice | undefined;
  let last: PaymentSlice | undefined;
  let paymentsMade = 0;

  for (let month = 1; month <= monthsToRun && balance > 0; month += 1) {
    const interest = Math.round(balance * monthlyRate);
    const clearsBalance = month === params.termMonths;
    let principalPaid = paymentCents - interest;
    if (clearsBalance || principalPaid > balance) {
      principalPaid = balance;
    }
    if (principalPaid < 0) {
      principalPaid = 0;
    }
    const total = principalPaid + interest;
    balance -= principalPaid;
    totalInterest += interest;
    totalPrincipal += principalPaid;
    const slice: PaymentSlice = {
      paymentNumber: month,
      principal: fromCents(principalPaid),
      interest: fromCents(interest),
      total: fromCents(total),
      balance: fromCents(balance),
    };
    if (first === undefined) {
      first = slice;
    }
    last = slice;
    paymentsMade += 1;
  }

  if (first === undefined || last === undefined) {
    throw new Error("Amortization produced no payments");
  }

  return {
    monthlyPrincipalAndInterest: fromCents(paymentCents),
    termMonths: params.termMonths,
    paymentsMade,
    totalPrincipal: fromCents(totalPrincipal),
    totalInterest: fromCents(totalInterest),
    totalOfPayments: fromCents(totalPrincipal + totalInterest),
    remainingBalance: fromCents(balance),
    firstPayment: first,
    lastPayment: last,
  };
}

export function calculateMortgage(input: MortgageInput): MortgageOutput {
  const principal = roundMoney(input.principal);
  const annualPropertyTax = roundMoney(input.annualPropertyTax);
  const annualInsurance = roundMoney(input.annualInsurance);
  const monthlyHoa = roundMoney(input.monthlyHoa);
  const monthlyPmi = roundMoney(input.monthlyPmi);
  const termMonths = input.termYears * 12;
  const schedule = amortizeLoan({
    principal,
    annualInterestRate: input.annualInterestRate,
    termMonths,
  });
  const monthlyPropertyTax = roundMoney(annualPropertyTax / 12);
  const monthlyInsurance = roundMoney(annualInsurance / 12);
  const totalMonthlyPayment = roundMoney(
    schedule.monthlyPrincipalAndInterest +
      monthlyPropertyTax +
      monthlyInsurance +
      monthlyHoa +
      monthlyPmi,
  );

  return {
    principal,
    annualInterestRate: input.annualInterestRate,
    termYears: input.termYears,
    termMonths,
    monthlyPrincipalAndInterest: schedule.monthlyPrincipalAndInterest,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi,
    totalMonthlyPayment,
    totalPrincipal: schedule.totalPrincipal,
    totalInterest: schedule.totalInterest,
    totalOfPayments: schedule.totalOfPayments,
    firstPayment: schedule.firstPayment,
    lastPayment: schedule.lastPayment,
  };
}

export function formatMortgage(result: MortgageOutput): string {
  const lines = [
    "Mortgage payment estimate",
    "",
    `Loan: ${usd(result.principal)} at ${percent(result.annualInterestRate)} for ${result.termYears} years (${result.termMonths} months)`,
    `Principal and interest: ${usd(result.monthlyPrincipalAndInterest)}`,
    `Property tax: ${usd(result.monthlyPropertyTax)}`,
    `Insurance: ${usd(result.monthlyInsurance)}`,
    `HOA: ${usd(result.monthlyHoa)}`,
    `PMI: ${usd(result.monthlyPmi)}`,
    `Total monthly payment: ${usd(result.totalMonthlyPayment)}`,
    "",
    "Amortization summary",
    `Total principal: ${usd(result.totalPrincipal)}`,
    `Total interest: ${usd(result.totalInterest)}`,
    `Total of principal and interest: ${usd(result.totalOfPayments)}`,
    `First payment: ${usd(result.firstPayment.principal)} principal, ${usd(result.firstPayment.interest)} interest, balance ${usd(result.firstPayment.balance)}`,
    `Last payment: ${usd(result.lastPayment.principal)} principal, ${usd(result.lastPayment.interest)} interest, balance ${usd(result.lastPayment.balance)}`,
    "",
    "Tax and insurance are the yearly amount divided by 12 and rounded to the cent. They are added on top of principal and interest and do not change the interest math.",
    ESTIMATE_LINE,
  ];
  return lines.join("\n");
}
