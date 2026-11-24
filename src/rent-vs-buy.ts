import * as z from "zod/v4";
import { ESTIMATE_LINE, percent, usd } from "./display.js";
import { amortizeLoan } from "./mortgage.js";
import { MAX_DOLLARS, roundMoney } from "./money.js";

export const rentVsBuyInputSchema = z
  .object({
    homePrice: z.number().finite().positive().max(MAX_DOLLARS).describe("Home price in dollars."),
    downPayment: z.number().finite().min(0).max(MAX_DOLLARS).describe("Cash down payment in dollars."),
    annualInterestRate: z
      .number()
      .finite()
      .min(0)
      .max(30)
      .describe("Annual mortgage rate as a percent. 6.5 means 6.5 percent."),
    termYears: z.number().int().min(1).max(40).describe("Loan term in years."),
    monthlyRent: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Current monthly rent in dollars for a comparable home."),
    horizonYears: z
      .number()
      .int()
      .min(1)
      .max(40)
      .describe("How many years to compare. Payments stop if the loan term ends first."),
    annualPropertyTax: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Yearly property tax in dollars. Held flat over the horizon. Defaults to 0.")
      .default(0),
    annualInsurance: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Yearly homeowners insurance in dollars. Held flat over the horizon. Defaults to 0.")
      .default(0),
    monthlyHoa: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Monthly HOA dues in dollars. Defaults to 0.")
      .default(0),
    monthlyMaintenance: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Monthly maintenance reserve in dollars. Defaults to 0.")
      .default(0),
    monthlyPmi: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Monthly PMI in dollars, charged only while the loan term is still running. Defaults to 0.")
      .default(0),
    buyingClosingCosts: z
      .number()
      .finite()
      .min(0)
      .max(MAX_DOLLARS)
      .describe("Buyer closing costs in dollars. Defaults to 0.")
      .default(0),
    sellingCostPercent: z
      .number()
      .finite()
      .min(0)
      .max(15)
      .describe("Cost to sell at the end, as a percent of the future home value. Defaults to 6.")
      .default(6),
    annualAppreciationPercent: z
      .number()
      .finite()
      .min(-20)
      .max(20)
      .describe("Yearly home appreciation as a percent. Defaults to 3.")
      .default(3),
    annualRentIncreasePercent: z
      .number()
      .finite()
      .min(0)
      .max(20)
      .describe("Yearly rent increase as a percent. Defaults to 3.")
      .default(3),
    alternateInvestmentReturnPercent: z
      .number()
      .finite()
      .min(0)
      .max(20)
      .describe(
        "Yearly return the renter could earn on the cash the buyer uses for the down payment and buying closing costs. Defaults to 5.",
      )
      .default(5),
  })
  .refine((value) => value.downPayment <= value.homePrice, {
    message: "Down payment cannot exceed the home price",
    path: ["downPayment"],
  });

const choiceSchema = z.enum(["buy", "rent", "tie"]);

export const rentVsBuyOutputSchema = z.object({
  horizonYears: z.number().int(),
  homePrice: z.number(),
  downPayment: z.number(),
  loanAmount: z.number(),
  startingMonthlyRent: z.number(),
  firstMonthOwnerCash: z
    .number()
    .describe("First monthly owner check: principal, interest, tax, insurance, HOA, maintenance, and PMI."),
  totalRentPaid: z.number(),
  renterInvestmentGain: z.number(),
  renterWealthChange: z.number().describe("Investment gain on the avoided cash outlay, minus rent paid."),
  totalInterestPaid: z.number(),
  totalPrincipalPaid: z.number(),
  totalPropertyTax: z.number(),
  totalInsurance: z.number(),
  totalHoa: z.number(),
  totalMaintenance: z.number(),
  totalPmi: z.number(),
  buyingClosingCosts: z.number(),
  sellingCosts: z.number(),
  endingHomeValue: z.number(),
  remainingLoanBalance: z.number(),
  saleProceeds: z.number().describe("Future value minus selling costs and the remaining loan."),
  totalOwnerCashOutlay: z
    .number()
    .describe("Cash the buyer writes: down payment, closing costs, mortgage payments, and carrying costs."),
  buyerWealthChange: z
    .number()
    .describe(
      "Sale proceeds after selling costs, minus the price, buying costs, interest, and carrying costs. Principal paid is equity, so it is not treated as a loss.",
    ),
  betterChoice: choiceSchema,
  wealthGap: z.number().describe("How much more wealth the better choice produces. Zero when they tie."),
  annualAppreciationPercent: z.number(),
  annualRentIncreasePercent: z.number(),
  alternateInvestmentReturnPercent: z.number(),
  sellingCostPercent: z.number(),
});

export type RentVsBuyInput = z.infer<typeof rentVsBuyInputSchema>;
export type RentVsBuyOutput = z.infer<typeof rentVsBuyOutputSchema>;

function compound(amount: number, annualPercent: number, years: number): number {
  return amount * (1 + annualPercent / 100) ** years;
}

export function calculateRentVsBuy(input: RentVsBuyInput): RentVsBuyOutput {
  const homePrice = roundMoney(input.homePrice);
  const downPayment = roundMoney(input.downPayment);
  const loanAmount = roundMoney(homePrice - downPayment);
  const ownershipMonths = input.horizonYears * 12;
  const loanMonths = loanAmount > 0 ? Math.min(ownershipMonths, input.termYears * 12) : 0;
  const schedule =
    loanMonths > 0
      ? amortizeLoan({
          principal: loanAmount,
          annualInterestRate: input.annualInterestRate,
          termMonths: input.termYears * 12,
          monthsToRun: loanMonths,
        })
      : undefined;

  let totalRentPaid = 0;
  for (let year = 0; year < input.horizonYears; year += 1) {
    const monthly = roundMoney(input.monthlyRent * (1 + input.annualRentIncreasePercent / 100) ** year);
    totalRentPaid = roundMoney(totalRentPaid + monthly * 12);
  }

  const monthlyTax = roundMoney(input.annualPropertyTax / 12);
  const monthlyInsurance = roundMoney(input.annualInsurance / 12);
  const totalPropertyTax = roundMoney(monthlyTax * ownershipMonths);
  const totalInsurance = roundMoney(monthlyInsurance * ownershipMonths);
  const totalHoa = roundMoney(input.monthlyHoa * ownershipMonths);
  const totalMaintenance = roundMoney(input.monthlyMaintenance * ownershipMonths);
  const monthlyPmi = loanMonths > 0 ? roundMoney(input.monthlyPmi) : 0;
  const totalPmi = roundMoney(monthlyPmi * loanMonths);
  const buyingClosingCosts = roundMoney(input.buyingClosingCosts);
  const endingHomeValue = roundMoney(compound(homePrice, input.annualAppreciationPercent, input.horizonYears));
  const sellingCosts = roundMoney((endingHomeValue * input.sellingCostPercent) / 100);
  const totalInterestPaid = schedule?.totalInterest ?? 0;
  const totalPrincipalPaid = schedule?.totalPrincipal ?? 0;
  const remainingLoanBalance = schedule?.remainingBalance ?? 0;
  const carrying = roundMoney(totalPropertyTax + totalInsurance + totalHoa + totalMaintenance + totalPmi);
  const saleProceeds = roundMoney(endingHomeValue - sellingCosts - remainingLoanBalance);
  const buyerWealthChange = roundMoney(
    endingHomeValue - sellingCosts - homePrice - buyingClosingCosts - totalInterestPaid - carrying,
  );
  const totalOwnerCashOutlay = roundMoney(
    downPayment +
      buyingClosingCosts +
      (schedule?.totalOfPayments ?? 0) +
      totalPropertyTax +
      totalInsurance +
      totalHoa +
      totalMaintenance +
      totalPmi,
  );

  const cashInvested = roundMoney(downPayment + buyingClosingCosts);
  const renterInvestmentGain = roundMoney(
    compound(cashInvested, input.alternateInvestmentReturnPercent, input.horizonYears) - cashInvested,
  );
  const renterWealthChange = roundMoney(renterInvestmentGain - totalRentPaid);
  const gap = roundMoney(buyerWealthChange - renterWealthChange);
  const betterChoice: RentVsBuyOutput["betterChoice"] = gap > 0 ? "buy" : gap < 0 ? "rent" : "tie";
  const firstMonthPi = schedule?.monthlyPrincipalAndInterest ?? 0;

  return {
    horizonYears: input.horizonYears,
    homePrice,
    downPayment,
    loanAmount,
    startingMonthlyRent: roundMoney(input.monthlyRent),
    firstMonthOwnerCash: roundMoney(
      firstMonthPi + monthlyTax + monthlyInsurance + input.monthlyHoa + input.monthlyMaintenance + monthlyPmi,
    ),
    totalRentPaid,
    renterInvestmentGain,
    renterWealthChange,
    totalInterestPaid,
    totalPrincipalPaid,
    totalPropertyTax,
    totalInsurance,
    totalHoa,
    totalMaintenance,
    totalPmi,
    buyingClosingCosts,
    sellingCosts,
    endingHomeValue,
    remainingLoanBalance,
    saleProceeds,
    totalOwnerCashOutlay,
    buyerWealthChange,
    betterChoice,
    wealthGap: Math.abs(gap),
    annualAppreciationPercent: input.annualAppreciationPercent,
    annualRentIncreasePercent: input.annualRentIncreasePercent,
    alternateInvestmentReturnPercent: input.alternateInvestmentReturnPercent,
    sellingCostPercent: input.sellingCostPercent,
  };
}

export function formatRentVsBuy(result: RentVsBuyOutput): string {
  const choiceText: Record<RentVsBuyOutput["betterChoice"], string> = {
    buy: `Buying produces about ${usd(result.wealthGap)} more wealth over this horizon.`,
    rent: `Renting produces about ${usd(result.wealthGap)} more wealth over this horizon.`,
    tie: "Buying and renting produce the same wealth over this horizon.",
  };

  return [
    "Rent versus buy estimate",
    "",
    `Horizon: ${result.horizonYears} years`,
    `Starting rent: ${usd(result.startingMonthlyRent)} per month`,
    `First month owner cash: ${usd(result.firstMonthOwnerCash)}`,
    "",
    `Total rent paid: ${usd(result.totalRentPaid)}`,
    `Renter investment gain: ${usd(result.renterInvestmentGain)}`,
    `Renter change in wealth: ${usd(result.renterWealthChange)}`,
    "",
    `Ending home value: ${usd(result.endingHomeValue)}`,
    `Selling costs: ${usd(result.sellingCosts)}`,
    `Remaining loan balance: ${usd(result.remainingLoanBalance)}`,
    `Sale proceeds: ${usd(result.saleProceeds)}`,
    `Interest paid: ${usd(result.totalInterestPaid)}`,
    `Principal paid: ${usd(result.totalPrincipalPaid)}`,
    `Owner cash written over the horizon: ${usd(result.totalOwnerCashOutlay)}`,
    `Buyer change in wealth: ${usd(result.buyerWealthChange)}`,
    "",
    choiceText[result.betterChoice],
    `Assumptions: appreciation ${percent(result.annualAppreciationPercent)}, rent growth ${percent(result.annualRentIncreasePercent)}, alternate return ${percent(result.alternateInvestmentReturnPercent)}, selling costs ${percent(result.sellingCostPercent)}.`,
    "",
    "Change in wealth treats principal paydown and appreciation as equity. Interest, taxes, insurance, HOA, maintenance, PMI, rent, and selling costs are costs. The renter is credited with growth on the down payment and buying closing costs. Tax and insurance stay flat. Rent steps up once a year.",
    ESTIMATE_LINE,
  ].join("\n");
}
