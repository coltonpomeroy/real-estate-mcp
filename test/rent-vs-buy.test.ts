import { describe, expect, it } from "vitest";
import { calculateRentVsBuy, rentVsBuyInputSchema } from "../src/rent-vs-buy.js";

const quiet = {
  homePrice: 100_000,
  downPayment: 100_000,
  annualInterestRate: 0,
  termYears: 30,
  monthlyRent: 0,
  horizonYears: 1,
  annualPropertyTax: 0,
  annualInsurance: 0,
  monthlyHoa: 0,
  monthlyMaintenance: 0,
  monthlyPmi: 0,
  buyingClosingCosts: 0,
  sellingCostPercent: 6,
  annualAppreciationPercent: 0,
  annualRentIncreasePercent: 0,
  alternateInvestmentReturnPercent: 0,
};

describe("rent versus buy", () => {
  it("charges selling costs against the buyer when nothing else changes", () => {
    const result = calculateRentVsBuy(quiet);

    expect(result.totalInterestPaid).toBe(0);
    expect(result.endingHomeValue).toBe(100_000);
    expect(result.sellingCosts).toBe(6000);
    expect(result.buyerWealthChange).toBe(-6000);
    expect(result.renterWealthChange).toBe(0);
    expect(result.betterChoice).toBe("rent");
    expect(result.wealthGap).toBe(6000);
  });

  it("compounds rent once a year", () => {
    const result = calculateRentVsBuy({
      ...quiet,
      monthlyRent: 1000,
      horizonYears: 2,
      annualRentIncreasePercent: 10,
      sellingCostPercent: 0,
    });

    expect(result.totalRentPaid).toBe(12_000 + 13_200);
  });

  it("prefers buying when rent is the only cost and the sale is free", () => {
    const result = calculateRentVsBuy({
      ...quiet,
      monthlyRent: 3000,
      sellingCostPercent: 0,
    });

    expect(result.betterChoice).toBe("buy");
    expect(result.renterWealthChange).toBe(-36_000);
    expect(result.buyerWealthChange).toBe(0);
  });

  it("rejects a down payment above the price", () => {
    const parsed = rentVsBuyInputSchema.safeParse({
      ...quiet,
      downPayment: 150_000,
    });
    expect(parsed.success).toBe(false);
  });
});
