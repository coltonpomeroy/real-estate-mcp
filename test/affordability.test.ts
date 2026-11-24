import { describe, expect, it } from "vitest";
import { affordabilityInputSchema, calculateAffordability } from "../src/affordability.js";
import { calculateMortgage } from "../src/mortgage.js";

const base = {
  annualGrossIncome: 120_000,
  monthlyDebtPayments: 0,
  downPayment: 0,
  annualInterestRate: 0,
  termYears: 30,
  maxFrontEndDtiPercent: 28,
  maxBackEndDtiPercent: 36,
  annualPropertyTaxRate: 0,
  annualInsuranceRate: 0,
  monthlyHoa: 0,
  annualPmiRate: 0,
};

describe("affordability", () => {
  it("lets the back-end limit bind when debts use the remaining room", () => {
    const result = calculateAffordability({
      ...base,
      monthlyDebtPayments: 2000,
    });

    expect(result.bindingConstraint).toBe("back_end_dti");
    expect(result.monthlyGrossIncome).toBe(10_000);
    expect(result.housingAllowance).toBe(1600);
    expect(result.totalMonthlyPayment).toBeLessThanOrEqual(1600);
    expect(result.totalMonthlyPayment).toBeGreaterThan(1599);
    expect(result.maxLoanAmount).toBe(result.maxHomePrice);
  });

  it("lets the front-end limit bind when there are no other debts", () => {
    const result = calculateAffordability(base);

    expect(result.bindingConstraint).toBe("front_end_dti");
    expect(result.housingAllowance).toBe(2800);
    expect(result.totalMonthlyPayment).toBeLessThanOrEqual(2800);
  });

  it("returns no price when debts already exceed the back-end limit", () => {
    const result = calculateAffordability({
      ...base,
      monthlyDebtPayments: 5000,
    });

    expect(result.bindingConstraint).toBe("insufficient_income");
    expect(result.maxHomePrice).toBe(0);
    expect(result.housingAllowance).toBe(0);
  });

  it("applies PMI only above 80 percent loan-to-value", () => {
    const withPmi = calculateAffordability({
      ...base,
      annualGrossIncome: 200_000,
      annualInterestRate: 6,
      downPayment: 20_000,
      annualPmiRate: 0.6,
    });
    const largeDown = calculateAffordability({
      ...base,
      annualGrossIncome: 200_000,
      annualInterestRate: 6,
      downPayment: 400_000,
      annualPmiRate: 0.6,
    });

    expect(withPmi.pmiApplied).toBe(true);
    expect(withPmi.monthlyPmi).toBeGreaterThan(0);
    expect(withPmi.loanToValuePercent).toBeGreaterThan(80);
    expect(largeDown.pmiApplied).toBe(false);
    expect(largeDown.monthlyPmi).toBe(0);
  });

  it("matches the mortgage tool for a price solved with principal and interest only", () => {
    const result = calculateAffordability({
      ...base,
      annualInterestRate: 6,
      downPayment: 50_000,
    });
    const mortgage = calculateMortgage({
      principal: result.maxLoanAmount,
      annualInterestRate: 6,
      termYears: 30,
      annualPropertyTax: 0,
      annualInsurance: 0,
      monthlyHoa: 0,
      monthlyPmi: 0,
    });

    expect(result.monthlyPrincipalAndInterest).toBe(mortgage.monthlyPrincipalAndInterest);
    expect(result.totalMonthlyPayment).toBeLessThanOrEqual(result.housingAllowance);
  });

  it("rejects a back-end limit below the front-end limit", () => {
    const parsed = affordabilityInputSchema.safeParse({
      ...base,
      maxFrontEndDtiPercent: 40,
      maxBackEndDtiPercent: 36,
    });
    expect(parsed.success).toBe(false);
  });
});
