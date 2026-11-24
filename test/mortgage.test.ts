import { describe, expect, it } from "vitest";
import { amortizeLoan, calculateMortgage, mortgageInputSchema } from "../src/mortgage.js";

describe("mortgage payment", () => {
  it("matches the standard level payment for a 200,000 loan at 6 percent", () => {
    const result = calculateMortgage({
      principal: 200_000,
      annualInterestRate: 6,
      termYears: 30,
      annualPropertyTax: 0,
      annualInsurance: 0,
      monthlyHoa: 0,
      monthlyPmi: 0,
    });

    expect(result.monthlyPrincipalAndInterest).toBe(1199.1);
    expect(result.firstPayment.interest).toBe(1000);
    expect(result.firstPayment.principal).toBe(199.1);
    expect(result.firstPayment.balance).toBe(199_800.9);
    expect(result.totalPrincipal).toBe(200_000);
    expect(result.lastPayment.balance).toBe(0);
    expect(result.totalOfPayments).toBeCloseTo(result.totalPrincipal + result.totalInterest, 2);
  });

  it("pays a zero-interest loan down with the last payment absorbing the rounding", () => {
    const result = calculateMortgage({
      principal: 1000,
      annualInterestRate: 0,
      termYears: 1,
      annualPropertyTax: 0,
      annualInsurance: 0,
      monthlyHoa: 0,
      monthlyPmi: 0,
    });

    expect(result.monthlyPrincipalAndInterest).toBe(83.33);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPrincipal).toBe(1000);
    expect(result.lastPayment.balance).toBe(0);
    expect(result.lastPayment.principal).toBe(83.37);
  });

  it("adds tax, insurance, HOA, and PMI without changing principal and interest", () => {
    const base = calculateMortgage({
      principal: 400_000,
      annualInterestRate: 6.5,
      termYears: 30,
      annualPropertyTax: 0,
      annualInsurance: 0,
      monthlyHoa: 0,
      monthlyPmi: 0,
    });
    const full = calculateMortgage({
      principal: 400_000,
      annualInterestRate: 6.5,
      termYears: 30,
      annualPropertyTax: 4800,
      annualInsurance: 1800,
      monthlyHoa: 75,
      monthlyPmi: 120,
    });

    expect(full.monthlyPrincipalAndInterest).toBe(base.monthlyPrincipalAndInterest);
    expect(full.monthlyPrincipalAndInterest).toBe(2528.27);
    expect(full.monthlyPropertyTax).toBe(400);
    expect(full.monthlyInsurance).toBe(150);
    expect(full.totalMonthlyPayment).toBe(2528.27 + 400 + 150 + 75 + 120);
  });

  it("stops a partial schedule with a remaining balance", () => {
    const partial = amortizeLoan({
      principal: 200_000,
      annualInterestRate: 6,
      termMonths: 360,
      monthsToRun: 12,
    });

    expect(partial.paymentsMade).toBe(12);
    expect(partial.remainingBalance).toBeGreaterThan(0);
    expect(partial.totalPrincipal + partial.remainingBalance).toBeCloseTo(200_000, 2);
  });

  it("rejects a non-positive principal", () => {
    expect(mortgageInputSchema.safeParse({ principal: 0, annualInterestRate: 6, termYears: 30 }).success).toBe(
      false,
    );
    expect(
      mortgageInputSchema.safeParse({ principal: -100, annualInterestRate: 6, termYears: 30 }).success,
    ).toBe(false);
  });
});
