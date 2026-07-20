const DEFAULT_DECIMALS = 2;

function resolveDecimals(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0) {
    return DEFAULT_DECIMALS;
  }

  return decimals;
}

export function truncateToDecimals(
  value: number,
  decimals = DEFAULT_DECIMALS
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const safeDecimals = resolveDecimals(decimals);
  const factor = 10 ** safeDecimals;
  const scaled = value * factor;
  // Floating point representation can leave an exact monetary value just below
  // its intended integer cent (for example, 1155.85 * 100 may be
  // 115584.99999999999). Scale the tolerance with the magnitude so truncation
  // does not incorrectly drop a cent.
  const precisionTolerance = Number.EPSILON * Math.max(1, Math.abs(scaled));
  const truncated =
    scaled < 0
      ? Math.ceil(scaled - precisionTolerance)
      : Math.floor(scaled + precisionTolerance);
  const result = truncated / factor;

  return Object.is(result, -0) ? 0 : result;
}

export function truncateMoney(value: number): number {
  return truncateToDecimals(value, DEFAULT_DECIMALS);
}
