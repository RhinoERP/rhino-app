export type PurchaseVariantStocks = Record<string, Record<string, number>>;

export type PurchaseVariantLine = {
  id?: string;
  product_id: string;
  quantity: number;
  variant_stocks?: unknown;
};

export function purchaseVariantAllocationChanged(
  item: PurchaseVariantLine,
  saved?: PurchaseVariantLine
): boolean {
  return (
    !saved ||
    saved.product_id !== item.product_id ||
    saved.quantity !== item.quantity ||
    JSON.stringify(saved.variant_stocks ?? null) !==
      JSON.stringify(item.variant_stocks ?? null)
  );
}

export function sumPurchaseVariantStocks(
  stocks: PurchaseVariantStocks | null | undefined
): number {
  return Object.values(stocks ?? {}).reduce(
    (sum, sizes) =>
      sum +
      Object.values(sizes).reduce((total, quantity) => total + quantity, 0),
    0
  );
}

/** Preserve quantities already ordered but not yet assigned to a variant. */
export function quantityAfterVariantChange(
  quantity: number,
  previousStocks: PurchaseVariantStocks | null | undefined,
  nextStocks: PurchaseVariantStocks
): number {
  const assigned = sumPurchaseVariantStocks(nextStocks);
  return sumPurchaseVariantStocks(previousStocks) < quantity
    ? Math.max(quantity, assigned)
    : assigned;
}

function inspectVariantEntries(
  stocks: Record<string, unknown>,
  available: Set<string>
): { assigned: number; error: string | null } {
  let assigned = 0;
  for (const [color, sizes] of Object.entries(stocks)) {
    if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) {
      return {
        assigned,
        error: "Las cantidades por talle y color son inválidas",
      };
    }
    for (const [talle, value] of Object.entries(sizes)) {
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
      ) {
        return {
          assigned,
          error:
            "Las cantidades por talle y color deben ser enteros no negativos",
        };
      }
      if (value > 0 && !available.has(JSON.stringify([color, talle]))) {
        return {
          assigned,
          error: `La variante ${color} / ${talle} no está activa para este producto`,
        };
      }
      assigned += value;
    }
  }
  return { assigned, error: null };
}

export function validatePurchaseVariantAllocation(
  quantity: number,
  stocks: unknown,
  activeVariants: Array<{ color: string; talle: string }>
): string | null {
  if (!(Number.isSafeInteger(quantity) && quantity > 0)) {
    return "La cantidad del producto con variantes debe ser un entero positivo";
  }
  if (!stocks || typeof stocks !== "object" || Array.isArray(stocks)) {
    return "Asigná talle y color a todas las unidades del producto";
  }

  const available = new Set(
    activeVariants.map((variant) =>
      JSON.stringify([variant.color, variant.talle])
    )
  );
  const { assigned, error } = inspectVariantEntries(
    stocks as Record<string, unknown>,
    available
  );
  if (error) {
    return error;
  }

  return assigned === quantity
    ? null
    : `Asignadas por talle y color: ${assigned} de ${quantity} unidades`;
}
