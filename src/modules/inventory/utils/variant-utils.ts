const VARIANT_SPLIT_REGEX = /\s+/;

/**
 * Normalizes a talle/color value:
 * - Trims whitespace
 * - Title-cases each word ("azul marino" → "Azul Marino", "ROJO" → "Rojo")
 */
export function normalizeVariantValue(value: string): string {
  return value
    .trim()
    .split(VARIANT_SPLIT_REGEX)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeTalleValue(value: string): string {
  return value.trim().toUpperCase();
}

const TALLE_BASE_RANK: Record<string, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

const TALLE_NXL_REGEX = /^(\d+)XL$/;
const TALLE_XXXL_REGEX = /^X{2,}L$/;
const TALLE_NUMERIC_REGEX = /^\d+$/;
const TALLE_NUMERIC_OFFSET = 100;

function talleRank(value: string): number | null {
  const talle = normalizeTalleValue(value);

  const baseRank = TALLE_BASE_RANK[talle];
  if (baseRank !== undefined) {
    return baseRank;
  }

  const nxl = TALLE_NXL_REGEX.exec(talle);
  if (nxl) {
    return 3 + Number(nxl[1]);
  }

  const xxxl = TALLE_XXXL_REGEX.exec(talle);
  if (xxxl) {
    return 3 + xxxl[0].length - 1;
  }

  if (TALLE_NUMERIC_REGEX.test(talle)) {
    return TALLE_NUMERIC_OFFSET + Number(talle);
  }

  return null;
}

/**
 * Compares two talle values using apparel size order:
 * XS < S < M < L < XL < 2XL < 3XL ... < NXL, then numeric sizes (36, 40, 42...).
 * Synonyms are treated as equivalent ("XXL" ranks the same as "2XL").
 * Unknown sizes are sorted alphabetically and placed after known ones.
 */
export function compareTalles(a: string, b: string): number {
  const rankA = talleRank(a);
  const rankB = talleRank(b);

  if (rankA !== null && rankB !== null) {
    return rankA - rankB;
  }
  if (rankA !== null) {
    return -1;
  }
  if (rankB !== null) {
    return 1;
  }
  return a.localeCompare(b);
}

/** Sorts a list of talle values in apparel size order. Returns a new array. */
export function sortTalles(talles: string[]): string[] {
  return [...talles].sort(compareTalles);
}
