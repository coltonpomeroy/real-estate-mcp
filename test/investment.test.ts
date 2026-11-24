import { describe, expect, it } from "vitest";
import { calculateInvestment, investmentInputSchema } from "../src/investment.js";
import { monthlyPrincipalAndInterest } from "../src/mortgage.js";
import { roundMoney, roundPercent } from "../src/money.js";

describe("investment returns", () => {
  it("computes cap rate from NOI and ignores financing when the purchase is all cash", () => {
    const result = calculateInvestment({
      purchasePrice: 250_000,
      grossAnnualRent: 20_000,
      operatingExpensesAnnual: 5000,
      vacancyPercent: 5,
      otherAnnualIncome: 0,
      annualInterestRate: 0,
      termYears: 30,
      closingCosts: 0,
    });

    expect(result.allCash).toBe(true);
    expect(result.vacancyLoss).toBe(1000);
    expect(result.netOperatingIncome).toBe(14_000);
    expect(result.capRatePercent).toBe(5.6);
    expect(result.loanAmount).toBe(0);
    expect(result.annualDebtService).toBe(0);
    expect(result.cashOnCashPercent).toBe(5.6);
  });

  it("charges debt service on the financed amount and divides cash flow by cash invested", () => {
    const result = calculateInvestment({
      purchasePrice: 250_000,
      grossAnnualRent: 30_000,
      operatingExpensesAnnual: 10_000,
      vacancyPercent: 0,
      otherAnnualIncome: 0,
      downPayment: 50_000,
      annualInterestRate: 6,
      termYears: 30,
      closingCosts: 5000,
    });
    const payment = monthlyPrincipalAndInterest(200_000, 6, 360);

    expect(result.allCash).toBe(false);
    expect(result.loanAmount).toBe(200_000);
    expect(result.monthlyPrincipalAndInterest).toBe(payment);
    expect(result.annualDebtService).toBe(roundMoney(payment * 12));
    expect(result.netOperatingIncome).toBe(20_000);
    expect(result.annualCashFlow).toBe(roundMoney(20_000 - payment * 12));
    expect(result.cashInvested).toBe(55_000);
    expect(result.cashOnCashPercent).toBe(roundPercent((result.annualCashFlow / 55_000) * 100));
  });

  it("leaves cash-on-cash empty when the buyer invests no cash", () => {
    const result = calculateInvestment({
      purchasePrice: 200_000,
      grossAnnualRent: 18_000,
      operatingExpensesAnnual: 4000,
      vacancyPercent: 0,
      otherAnnualIncome: 0,
      downPayment: 0,
      annualInterestRate: 6,
      termYears: 30,
      closingCosts: 0,
    });

    expect(result.cashInvested).toBe(0);
    expect(result.cashOnCashPercent).toBeNull();
    expect(result.capRatePercent).toBe(7);
  });

  it("rejects a down payment above the price", () => {
    const parsed = investmentInputSchema.safeParse({
      purchasePrice: 100_000,
      grossAnnualRent: 10_000,
      operatingExpensesAnnual: 2000,
      downPayment: 120_000,
    });
    expect(parsed.success).toBe(false);
  });
});
