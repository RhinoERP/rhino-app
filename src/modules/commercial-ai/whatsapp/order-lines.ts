/**
 * Pedidos del vendedor por WhatsApp · partes puras (sin base ni red).
 *
 * Calcula el precio de cada producto con las mismas reglas que la pantalla de
 * preventa (nivel de lista del cliente, lista especial y asignaciones por
 * proveedor), arma las líneas y el resumen que se le muestra al vendedor.
 */
import { truncateMoney } from "@/lib/decimal";
import {
  calculateSalePrice,
  type SalePriceAdjustment,
} from "@/modules/price-levels/service/price-calculator";
import type { PriceLevel } from "@/modules/price-levels/types";
import { formatMoney, niceName } from "../engine/analysis";

export type OrderProduct = {
  id: string;
  name: string;
  sku: string | null;
  supplierId: string | null;
  basePrice: number;
  costPrice: number | null;
  unitOfMeasure: string;
  tracksStockUnits: boolean;
  weightPerUnit: number | null;
  hasVariants: boolean;
};

export type PriceAssignment = {
  level: PriceLevel | null;
  adjustments: SalePriceAdjustment[];
};

export type PricingRules = {
  /** Nivel y lista especial del cliente. */
  fallback: PriceAssignment;
  /** Asignaciones por proveedor (si la empresa tiene listas configurables). */
  bySupplier: Map<string, PriceAssignment>;
  /** Costo del producto según la lista de compra asignada al proveedor. */
  supplierCosts: Map<string, Map<string, number>>;
};

export type OrderLine = {
  productId: string;
  name: string;
  /** Lo que va en sales_order_items.quantity (unidades o piezas). */
  quantity: number;
  /** Kilos o litros cuando se vende por peso y se cuentan piezas. */
  weightQuantity: number | null;
  unitPrice: number;
  tracksStockUnits: boolean;
  /** Cantidad que se cobra (kg/lt o unidades). */
  billedQuantity: number;
  unit: string;
  /** El peso es aproximado (se pidió en piezas). */
  estimated: boolean;
  subtotal: number;
};

const WEIGHT_UNITS = new Set(["KG", "LT"]);
const UNIT_TEXT: Record<string, string> = {
  UN: "u.",
  KG: "kg",
  LT: "lt",
  MT: "m",
};
const QUANTITY_DECIMALS = 3;

export function isWeightUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit);
}

/** Precio unitario para el cliente, igual que en la preventa manual. */
export function unitPriceFor(
  product: OrderProduct,
  rules: PricingRules
): number {
  const supplierCost = product.supplierId
    ? rules.supplierCosts.get(product.supplierId)?.get(product.id)
    : undefined;
  const assignment =
    (product.supplierId && rules.bySupplier.get(product.supplierId)) ||
    rules.fallback;
  return calculateSalePrice({
    basePrice: product.basePrice,
    costPrice: supplierCost ?? product.costPrice,
    level: assignment.level,
    adjustments: assignment.adjustments,
  }).price;
}

function round(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Pasa "5 de cremoso" a la línea de la preventa. Los productos por peso que
 * cuentan piezas guardan piezas en quantity y kilos en weightQuantity: si el
 * vendedor pidió piezas, los kilos salen del peso promedio (aproximado).
 */
type Quantities = {
  quantity: number;
  weightQuantity: number | null;
  estimated: boolean;
};

function invalidAmount(product: OrderProduct): Error {
  return new Error(`La cantidad de ${niceName(product.name)} no es válida.`);
}

/** Producto por peso que cuenta piezas: piezas en quantity, kilos aparte. */
function pieceQuantities(
  product: OrderProduct,
  amount: number,
  inPieces: boolean
): Quantities {
  const perPiece = product.weightPerUnit ?? 0;
  if (!inPieces) {
    return {
      quantity: perPiece > 0 ? Math.max(1, Math.round(amount / perPiece)) : 1,
      weightQuantity: round(amount),
      estimated: false,
    };
  }
  if (perPiece <= 0) {
    throw new Error(
      `${niceName(product.name)} no tiene peso por pieza cargado: pedímelo en ${UNIT_TEXT[product.unitOfMeasure]}.`
    );
  }
  const quantity = Math.round(amount);
  if (quantity <= 0) {
    throw invalidAmount(product);
  }
  return {
    quantity,
    weightQuantity: round(quantity * perPiece),
    estimated: true,
  };
}

function quantitiesFor(
  product: OrderProduct,
  amount: number,
  inPieces: boolean
): Quantities {
  if (!isWeightUnit(product.unitOfMeasure)) {
    const quantity = Math.round(amount);
    if (quantity <= 0) {
      throw invalidAmount(product);
    }
    return { quantity, weightQuantity: null, estimated: false };
  }
  if (product.tracksStockUnits) {
    return pieceQuantities(product, amount, inPieces);
  }
  return { quantity: round(amount), weightQuantity: null, estimated: false };
}

export function lineFor(
  product: OrderProduct,
  amount: number,
  inPieces: boolean,
  unitPrice: number
): OrderLine {
  if (!(Number.isFinite(amount) && amount > 0)) {
    throw invalidAmount(product);
  }
  const { quantity, weightQuantity, estimated } = quantitiesFor(
    product,
    amount,
    inPieces
  );

  const billedQuantity = weightQuantity ?? quantity;
  return {
    productId: product.id,
    name: product.name,
    quantity,
    weightQuantity,
    unitPrice,
    tracksStockUnits: product.tracksStockUnits,
    billedQuantity,
    unit: product.unitOfMeasure,
    estimated,
    subtotal: truncateMoney(billedQuantity * unitPrice),
  };
}

function quantityText(line: OrderLine): string {
  const unit = UNIT_TEXT[line.unit] ?? line.unit.toLowerCase();
  const amount = line.billedQuantity.toLocaleString("es-AR", {
    maximumFractionDigits: QUANTITY_DECIMALS,
  });
  if (line.weightQuantity !== null) {
    const pieces = `${line.quantity} ${line.quantity === 1 ? "pieza" : "piezas"}`;
    return `${pieces}, ${line.estimated ? "~" : ""}${amount} ${unit}`;
  }
  return `${amount} ${unit}`;
}

export type OrderSummaryInput = {
  customerName: string;
  lines: OrderLine[];
  total: number;
  note: string | null;
};

/** El resumen que confirma el vendedor. */
export function orderSummary(order: OrderSummaryInput): string {
  const lines = order.lines.map(
    (line) =>
      `• ${niceName(line.name)} · ${quantityText(line)} × ${formatMoney(line.unitPrice)} = ${formatMoney(line.subtotal)}`
  );
  const estimated = order.lines.some((line) => line.estimated);
  return [
    `*Pedido para ${niceName(order.customerName)}*`,
    ...lines,
    `*Total con impuestos: ${formatMoney(order.total)}*${estimated ? " (aprox., se ajusta al pesar)" : ""}`,
    ...(order.note ? [`Nota: ${order.note}`] : []),
    "",
    "¿Lo cargo como preventa? Respondé *sí* para confirmar o *cancelar*.",
  ].join("\n");
}

const ACCENTS = /[̀-ͯ]/g;
const CANCEL =
  /^(no|cancelar|cancela|cancelalo|anular|anulalo|borralo|descartar|dejalo)[!. ]*$/;

export function isCancel(text: string): boolean {
  return CANCEL.test(
    text.trim().toLowerCase().normalize("NFD").replace(ACCENTS, "")
  );
}
