import Decimal from "decimal.js";

// Configuración global de Decimal.js
Decimal.set({
  precision: 20, // dígitos significativos
  rounding: Decimal.ROUND_HALF_UP,
  toExpPos: 20, // evitar notación científica en outputs normales
  toExpNeg: -20,
});

/**
 * Convierte un valor de cualquier tipo a Decimal.
 * Valores nulos, vacíos o no numéricos retornan Decimal(0).
 */
export function toDecimal(value: string | number | null | undefined): Decimal {
  if (value == null || value === "") {
    return new Decimal(0);
  }
  try {
    return new Decimal(String(value));
  } catch {
    return new Decimal(0);
  }
}

/**
 * Convierte un Decimal a string con 4 decimales fijos.
 * Formato: "1210.0000" — nunca notación científica.
 */
export function safeStr(d: Decimal): string {
  return d.toFixed(4);
}

/**
 * Navega un objeto anidado usando dot-notation.
 * getNestedValue({ datos: { montoIVA21: "210.0000" } }, "datos.montoIVA21") → "210.0000"
 * Retorna undefined si cualquier segmento del path no existe.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evalúa una fórmula de suma/resta de paths sobre el evento.
 *
 * Soporta:
 *   "datos.montoNeto"
 *   "datos.montoNeto+datos.montoIVA21"
 *   "datos.montoNeto+datos.montoIVA21+datos.montoIVA105"
 *   "datos.totalFactura-datos.montoIVA21"
 *
 * NO soporta: multiplicación, división, literales numéricos, paréntesis.
 * Cualquier path inexistente en el evento aporta Decimal(0) → la línea
 * correspondiente se puede omitir con `if (monto.isZero()) continue`.
 *
 * NUNCA usa eval() ni Function() — tokenización puramente con split/regex.
 */
const FORMULA_SPLIT_RE = /([+-])/;

export function evaluateFormula(formula: string, event: unknown): Decimal {
  // Dividir por + o - preservando el separador como token independiente
  const tokens = formula.split(FORMULA_SPLIT_RE);
  let result = new Decimal(0);
  let operator = "+";

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === "") {
      continue;
    }

    if (trimmed === "+" || trimmed === "-") {
      operator = trimmed;
      continue;
    }

    const raw = getNestedValue(event, trimmed);
    const decimal = raw != null ? toDecimal(String(raw)) : new Decimal(0);
    result = operator === "+" ? result.plus(decimal) : result.minus(decimal);
  }

  return result;
}

/**
 * Verifica si dos Decimals son iguales dentro de una tolerancia.
 * Usado para la validación de balance de asientos.
 */
export function isBalanced(
  debe: Decimal,
  haber: Decimal,
  tolerance = 0.001
): boolean {
  return debe.minus(haber).abs().lessThanOrEqualTo(tolerance);
}
