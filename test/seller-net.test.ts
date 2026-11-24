import { describe, expect, it } from "vitest";
import { calculateSellerNet } from "../src/seller-net.js";

describe("seller net sheet", () => {
  it("subtracts commission, payoff, costs, and concessions", () => {
    const result = calculateSellerNet({
      salePrice: 525_000,
      mortgagePayoff: 280_000,
      commissionPercent: 5.5,
      closingCosts: 7000,
      concessions: 8000,
    });

    expect(result.commissionAmount).toBe(28_875);
    expect(result.estimatedNetProceeds).toBe(525_000 - 28_875 - 280_000 - 7000 - 8000);
    expect(result.sellerBringsCash).toBe(false);
    expect(result.netProceedsPercentOfSale).toBeCloseTo((result.estimatedNetProceeds / 525_000) * 100, 4);
  });

  it("flags a seller who would bring cash to closing", () => {
    const result = calculateSellerNet({
      salePrice: 100_000,
      mortgagePayoff: 100_000,
      commissionPercent: 6,
      closingCosts: 0,
      concessions: 0,
    });

    expect(result.estimatedNetProceeds).toBe(-6000);
    expect(result.sellerBringsCash).toBe(true);
  });
});
