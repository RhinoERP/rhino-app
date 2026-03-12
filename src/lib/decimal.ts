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
  const truncated =
    scaled < 0
      ? Math.ceil(scaled - Number.EPSILON)
      : Math.floor(scaled + Number.EPSILON);
  const result = truncated / factor;

  return Object.is(result, -0) ? 0 : result;
}

export function truncateMoney(value: number): number {
  return truncateToDecimals(value, DEFAULT_DECIMALS);
}
