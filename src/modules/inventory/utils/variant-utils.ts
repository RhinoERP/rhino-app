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
