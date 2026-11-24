export const ESTIMATE_LINE =
  "Estimate only. Confirm these figures with a lender, title company, or advisor before you rely on them.";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function usd(amount: number): string {
  return usdFormatter.format(amount);
}

export function percent(amount: number): string {
  return `${amount.toFixed(2)}%`;
}
