import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import {
  buildItemizedTaxPlan,
  type ItemTaxInput,
} from "@/modules/taxes/item-tax-calculations";
import type { MeliLot, MeliProduct, ValidatedMeliSale } from "../types";
import { assertMeliFiscalTaxPlan } from "../utils/fiscal-tax-plan";
import { sumMeliMoney } from "../utils/money";

function compareLots(a: MeliLot, b: MeliLot): number {
  for (const field of ["expiration_date", "created_at"] as const) {
    const left = a[field] ?? "9999-12-31";
    const right = b[field] ?? "9999-12-31";
    if (left !== right) {
      return left.localeCompare(right);
    }
  }
  return a.lot_number.localeCompare(b.lot_number) || a.id.localeCompare(b.id);
}

type Allocation = { lot_id: string; quantity: number; unit_quantity: number };

function allocateStock(
  lots: MeliLot[],
  requiredBase: number,
  requiredUnits: number
): Allocation[] {
  let base = requiredBase;
  let units = requiredUnits;
  const allocations: Allocation[] = [];
  for (const lot of lots) {
    if (base <= 0) {
      break;
    }
    const take = truncateToDecimals(
      Math.min(base, Math.max(0, lot.quantity_available)),
      6
    );
    if (take <= 0) {
      continue;
    }
    const takeUnits = Math.min(
      units,
      Math.max(0, Math.floor(lot.unit_quantity_available ?? 0))
    );
    allocations.push({
      lot_id: lot.id,
      quantity: take,
      unit_quantity: takeUnits,
    });
    lot.quantity_available = truncateToDecimals(
      lot.quantity_available - take,
      6
    );
    lot.unit_quantity_available =
      (lot.unit_quantity_available ?? 0) - takeUnits;
    base = truncateToDecimals(base - take, 6);
    units -= takeUnits;
  }
  if (base !== 0 || units !== 0) {
    throw new Error("No hay stock suficiente en los lotes del depósito Meli.");
  }
  return allocations;
}

function stockRequirements(
  product: MeliProduct,
  item: ValidatedMeliSale["items"][number]
) {
  const measured =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  const pieces = measured && product.tracks_stock_units;
  const integerQuantity =
    product.has_variants || product.unit_of_measure === "UN" || pieces;
  if (integerQuantity && !Number.isSafeInteger(item.quantity)) {
    throw new Error("La cantidad de unidades debe ser entera.");
  }
  if (
    (!measured && item.weightQuantity !== null) ||
    (pieces && item.weightQuantity === null)
  ) {
    throw new Error("Revisá el peso o volumen de la línea.");
  }
  return {
    base: measured ? (item.weightQuantity ?? item.quantity) : item.quantity,
    units: pieces ? item.quantity : 0,
  };
}

function referencePriceInSaleCurrency(price: number, rate: number): number {
  const value = price / rate;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error(
      "El precio de referencia supera la precisión monetaria admitida."
    );
  }
  return truncateMoney(value);
}

/** Pure plan; copies lot balances so repeated lines share only this plan's stock. */
export function buildMeliSalePlan(params: {
  input: ValidatedMeliSale;
  products: MeliProduct[];
  basePrices: ReadonlyMap<string, number>;
  lots: MeliLot[];
  productTaxes: ReadonlyMap<string, ItemTaxInput[]>;
  fallbackTaxes: ItemTaxInput[];
}) {
  const { input } = params;
  const referenceRate =
    input.currency === "USD" ? input.commercialExchangeRate : 1;
  if (
    !(referenceRate && Number.isFinite(referenceRate)) ||
    referenceRate <= 0
  ) {
    throw new Error(
      "No se pudo resolver la cotización del precio de referencia."
    );
  }
  const products = new Map(
    params.products.map((product) => [product.id, product])
  );
  const lots = params.lots.map((lot) => ({ ...lot })).sort(compareLots);
  const lotsByProduct = new Map<string, MeliLot[]>();
  for (const lot of lots) {
    const key = `${lot.product_id}:${lot.product_variant_id ?? "none"}`;
    const group = lotsByProduct.get(key) ?? [];
    group.push(lot);
    lotsByProduct.set(key, group);
  }
  const lines = input.items.map((item, index) => {
    const product = products.get(item.productId);
    if (!product?.is_active) {
      throw new Error("Un producto no existe o está inactivo.");
    }
    if (Boolean(product.has_variants) !== Boolean(item.productVariantId)) {
      throw new Error("La variante no corresponde al producto.");
    }
    const { base, units } = stockRequirements(product, item);
    const gross = truncateMoney(base * item.unitPrice);
    if (base * item.unitPrice > Number.MAX_SAFE_INTEGER / 100) {
      throw new Error(
        "El importe de la línea supera la precisión monetaria admitida."
      );
    }
    if (item.discountAmount > gross) {
      throw new Error("El descuento supera el importe de la línea.");
    }
    const listPrice = params.basePrices.get(item.productId);
    if (
      listPrice === undefined ||
      !Number.isFinite(listPrice) ||
      listPrice < 0
    ) {
      throw new Error("No se pudo resolver el precio de Venta Directa.");
    }
    return {
      lineId: String(index),
      product_id: item.productId,
      product_variant_id: item.productVariantId,
      quantity: item.quantity,
      unit_quantity: item.weightQuantity,
      unit_price: item.unitPrice,
      base_price: referencePriceInSaleCurrency(listPrice, referenceRate),
      discount_amount: item.discountAmount,
      subtotal: truncateMoney(gross - item.discountAmount),
      allocations: allocateStock(
        lotsByProduct.get(
          `${item.productId}:${item.productVariantId ?? "none"}`
        ) ?? [],
        base,
        units
      ),
    };
  });
  const subtotal = sumMeliMoney(lines.map((line) => line.subtotal));
  if (subtotal > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error("El subtotal supera la precisión monetaria admitida.");
  }
  const globalDiscount = truncateMoney(
    (subtotal * input.globalDiscountPercentage) / 100
  );
  const taxPlan = buildItemizedTaxPlan({
    lines: lines.map((line) => ({
      lineId: line.lineId,
      productId: line.product_id,
      netAmount: line.subtotal,
      taxes: params.productTaxes.get(line.product_id),
    })),
    globalDiscountAmount: globalDiscount,
    fallbackTaxes: params.fallbackTaxes,
  });
  const total = sumMeliMoney([
    subtotal,
    -globalDiscount,
    taxPlan.totalTaxAmount,
  ]);
  assertMeliFiscalTaxPlan(input.invoiceType, taxPlan, total);
  if (total <= 0) {
    throw new Error("El total de la venta debe ser mayor a cero.");
  }
  return {
    marketplace_order_number: input.marketplaceOrderNumber,
    warehouse_id: input.warehouseId,
    sale_date: input.saleDate,
    customer_id: input.customerId,
    receiver: input.receiver,
    invoice_type: input.invoiceType,
    currency: input.currency,
    commercial_exchange_rate:
      input.currency === "USD" ? input.commercialExchangeRate : null,
    observations: input.observations,
    global_discount_amount: globalDiscount,
    total_amount: total,
    items: lines.map(({ lineId, ...line }) => ({
      ...line,
      taxes: taxPlan.itemTaxes
        .filter((tax) => tax.lineId === lineId)
        .map((tax) => {
          if (!(tax.taxId && tax.taxCodeSnapshot)) {
            throw new Error(
              "Un impuesto no tiene configuración fiscal válida."
            );
          }
          return {
            tax_id: tax.taxId,
            name: tax.name,
            rate: tax.rate,
            base_amount: tax.baseAmount,
            tax_amount: tax.taxAmount,
            tax_code_snapshot: tax.taxCodeSnapshot,
          };
        }),
    })),
  };
}
