/** Largest dollar amount accepted by the calculators. */
export const MAX_DOLLARS = 100_000_000;

/**
 * Nearest cent. Positive amounts use half-up rounding.
 * Inputs are already finite dollar amounts from the schemas.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function roundMoney(dollars: number): number {
  return fromCents(toCents(dollars));
}

/** Percents are rounded to 4 decimal places (one ten-thousandth of a percent). */
export function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
