/**
 * Factura de proveedor leída de un PDF · reglas puras (sin base ni red).
 *
 * Encuentra el proveedor por CUIT o nombre, cada línea con su producto (por
 * equivalencia guardada, código o nombre) y la convierte en un ítem de compra
 * con las mismas cuentas que la carga manual.
 */
import { truncateMoney } from "@/lib/decimal";
import { calculateSubtotal } from "../utils/purchase-calculations";
import type { ExtractedInvoice, ExtractedInvoiceLine } from "./schema";

const ACCENTS = /[̀-ͯ]/g;
const NOT_ALNUM = /[^a-z0-9]+/g;
const NON_DIGITS = /\D/g;
const MIN_TOKEN = 2;
const ALIAS_MAX = 120;
const QUANTITY_DECIMALS = 3;
/** Por encima de esto la línea se toma sola; si no, el usuario elige. */
export const AUTO_MATCH_SCORE = 0.6;
const CLEAR_LEAD = 0.15;
const SUPPLIER_NAME_SCORE = 0.6;
const CANDIDATES = 5;

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
  "sin",
  "por",
  "para",
  "x",
  "un",
  "una",
  "und",
  "unid",
  "uni",
  "sa",
  "srl",
  "sas",
  "sociedad",
  "anonima",
  "responsabilidad",
  "limitada",
]);

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    .replace(NOT_ALNUM, " ")
    .trim();
}

function tokens(value: string | null | undefined): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= MIN_TOKEN && !STOPWORDS.has(token))
  );
}

/** Parecido entre dos textos: 0 nada, 1 iguales. */
export function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!(left.size && right.size)) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  const jaccard = shared / (left.size + right.size - shared);
  const containment = shared / Math.min(left.size, right.size);
  return (jaccard + containment) / 2;
}

export function cuitDigits(value: string | null | undefined): string {
  return (value ?? "").replace(NON_DIGITS, "");
}

export type SupplierOption = { id: string; name: string; cuit: string | null };

export type SupplierMatch = {
  supplierId: string | null;
  how: "cuit" | "nombre" | null;
};

/** El emisor de la factura entre los proveedores cargados. */
export function matchSupplier(
  issuer: ExtractedInvoice["proveedor"],
  suppliers: SupplierOption[],
  ownCuit?: string | null
): SupplierMatch {
  const cuit = cuitDigits(issuer.cuit);
  if (cuit && cuit !== cuitDigits(ownCuit)) {
    const byCuit = suppliers.find((s) => cuitDigits(s.cuit) === cuit);
    if (byCuit) {
      return { supplierId: byCuit.id, how: "cuit" };
    }
  }
  const ranked = suppliers
    .map((s) => ({ s, score: similarity(issuer.nombre, s.name) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= SUPPLIER_NAME_SCORE) {
    return { supplierId: best.s.id, how: "nombre" };
  }
  return { supplierId: null, how: null };
}

export type MatchProduct = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
};

/** Clave para recordar "esta línea del proveedor es este producto". */
export function aliasKey(
  line: Pick<ExtractedInvoiceLine, "codigo" | "descripcion">
): string {
  const code = normalizeText(line.codigo);
  return (
    code ? `cod:${code}` : `txt:${normalizeText(line.descripcion)}`
  ).slice(0, ALIAS_MAX);
}

export type LineMatch = {
  productId: string | null;
  how: "recordado" | "codigo" | "nombre" | null;
  score: number;
  /** Mejores opciones para que el usuario elija si no hubo match seguro. */
  candidates: string[];
};

export function matchLine(
  line: ExtractedInvoiceLine,
  products: MatchProduct[],
  aliases: Map<string, string>
): LineMatch {
  const ids = new Set(products.map((p) => p.id));
  const remembered = aliases.get(aliasKey(line));
  if (remembered && ids.has(remembered)) {
    return {
      productId: remembered,
      how: "recordado",
      score: 1,
      candidates: [],
    };
  }
  const code = normalizeText(line.codigo);
  if (code) {
    const byCode = products.find((p) => p.sku && normalizeText(p.sku) === code);
    if (byCode) {
      return { productId: byCode.id, how: "codigo", score: 1, candidates: [] };
    }
  }
  const ranked = products
    .map((p) => ({
      id: p.id,
      score: similarity(line.descripcion, `${p.name} ${p.brand ?? ""}`),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  const sure =
    best &&
    best.score >= AUTO_MATCH_SCORE &&
    (!second || best.score - second.score >= CLEAR_LEAD);
  return {
    productId: sure ? best.id : null,
    how: sure ? "nombre" : null,
    score: best?.score ?? 0,
    candidates: ranked.slice(0, CANDIDATES).map((r) => r.id),
  };
}

export type ItemProduct = {
  id: string;
  name: string;
  unit_of_measure: string | null;
  weight_per_unit: number | null;
  units_per_box: number | null;
  has_variants?: boolean;
};

export type ImportedItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_quantity: number;
  unit_cost: number;
  subtotal: number;
  unit_of_measure: string;
  weight_per_unit: number | null;
  total_weight_kg?: number;
  price_per_kg?: number;
  discount_percent: number;
  has_variants: boolean;
};

const MEASURE_UNITS = new Set(["KG", "LT", "MT"]);

function round(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS;
  return Math.round(value * factor) / factor;
}

type Pricing = {
  quantity: number;
  unitCost: number;
  totalWeight: number | null;
  pricePerKg: number | undefined;
};

/** Línea en kilos/litros para un producto por peso: piezas por el peso promedio. */
function fromMeasure(
  line: ExtractedInvoiceLine,
  unit: string,
  perPiece: number
): Pricing {
  const pricePerKg = unit === "KG" ? line.precio_unitario : undefined;
  if (perPiece <= 0) {
    return {
      quantity: line.cantidad,
      unitCost: line.precio_unitario,
      totalWeight: null,
      pricePerKg,
    };
  }
  return {
    quantity: round(line.cantidad / perPiece),
    unitCost:
      unit === "KG" ? line.precio_unitario : line.precio_unitario * perPiece,
    totalWeight: line.cantidad,
    pricePerKg,
  };
}

/** Línea en piezas para un producto por peso. */
function fromPieces(
  line: ExtractedInvoiceLine,
  unit: string,
  perPiece: number
): Pricing {
  const pricePerKg =
    unit === "KG" ? line.precio_unitario / perPiece : undefined;
  return {
    quantity: line.cantidad,
    unitCost: pricePerKg ?? line.precio_unitario,
    totalWeight: round(line.cantidad * perPiece),
    pricePerKg,
  };
}

function pricingFor(line: ExtractedInvoiceLine, product: ItemProduct): Pricing {
  const unit = product.unit_of_measure || "UN";
  const perPiece = Number(product.weight_per_unit ?? 0);
  const perBox = Number(product.units_per_box ?? 0);
  if (line.unidad === "CAJA" && perBox > 0) {
    return {
      quantity: line.cantidad * perBox,
      unitCost: line.precio_unitario / perBox,
      totalWeight: null,
      pricePerKg: undefined,
    };
  }
  if (MEASURE_UNITS.has(unit) && MEASURE_UNITS.has(line.unidad)) {
    return fromMeasure(line, unit, perPiece);
  }
  if (MEASURE_UNITS.has(unit) && perPiece > 0) {
    return fromPieces(line, unit, perPiece);
  }
  return {
    quantity: line.cantidad,
    unitCost: line.precio_unitario,
    totalWeight: null,
    pricePerKg: undefined,
  };
}

/**
 * Pasa la línea de la factura a un ítem de la compra, en la unidad del
 * producto: cajas a unidades, kilos a piezas (con el peso promedio).
 */
export function itemFromLine(
  line: ExtractedInvoiceLine,
  product: ItemProduct
): ImportedItem {
  const unit = product.unit_of_measure || "UN";
  const discount = Math.min(Math.max(line.descuento_porcentaje || 0, 0), 100);
  const { quantity, unitCost, totalWeight, pricePerKg } = pricingFor(
    line,
    product
  );

  const subtotal = calculateSubtotal({
    totalWeight,
    pricePerKg,
    quantity,
    unitCost,
    discountPercent: discount,
  });
  return {
    product_id: product.id,
    product_name: product.name,
    quantity: round(quantity),
    unit_quantity: totalWeight ?? round(quantity),
    unit_cost: unitCost,
    subtotal: truncateMoney(subtotal),
    unit_of_measure: unit,
    weight_per_unit: product.weight_per_unit,
    total_weight_kg: totalWeight ?? undefined,
    price_per_kg: pricePerKg,
    discount_percent: discount,
    has_variants: Boolean(product.has_variants),
  };
}

/** Días entre la fecha de la factura y el vencimiento (null si no hay). */
export function daysToDue(date: string, due: string | null): number | null {
  if (!due) {
    return null;
  }
  const days = Math.round(
    (Date.parse(`${due}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) /
      86_400_000
  );
  return Number.isFinite(days) && days > 0 ? days : null;
}

export function invoiceTaxTotal(invoice: ExtractedInvoice): number {
  return truncateMoney(
    invoice.impuestos.reduce((acc, t) => acc + t.importe, 0)
  );
}

/** Las alícuotas de IVA de la factura (21, 10.5…) para elegir los impuestos. */
export function vatRates(invoice: ExtractedInvoice): number[] {
  const rates = invoice.impuestos
    .filter((t) => normalizeText(t.nombre).includes("iva") && t.alicuota)
    .filter((t) => !normalizeText(t.nombre).includes("percep"))
    .map((t) => Number(t.alicuota));
  return [...new Set(rates)];
}
