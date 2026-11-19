import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import type { RemittanceData } from "@/modules/sales/service/remittance-generator.service";
import { REMITTANCE_MASK_ITEMS_PER_PAGE } from "@/modules/sales/service/remittance-mask-generator.service";
import type { Database } from "@/types/supabase";

type DocumentLineInsert =
  Database["public"]["Tables"]["order_remittance_lines"]["Insert"];
type SourceInsert =
  Database["public"]["Tables"]["order_remittance_line_sources"]["Insert"];

export type RemittancePlanRow = {
  source: {
    id: string;
    orderId: string;
    product_id: string | null;
    product_variant_id: string | null;
  };
  item: Omit<RemittanceData["items"][number], "unitOfMeasure"> & {
    unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"];
  };
};

export type PlannedRemittanceLine = Omit<
  DocumentLineInsert,
  "id" | "organization_id" | "remittance_id"
> & {
  sources: Pick<SourceInsert, "order_id" | "quote_item_id" | "quantity">[];
};

export type PlannedRemittanceDocument = {
  position: number;
  lines: PlannedRemittanceLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  suggestedDeclaredValue: number;
};

const compareText = (left: string, right: string) =>
  left < right ? -1 : Number(left > right);

function groupingKey(row: RemittancePlanRow): string {
  const { source, item } = row;
  if (!source.product_id || item.weightQuantity != null) {
    return JSON.stringify(["single", source.id]);
  }
  return JSON.stringify([
    source.product_id,
    source.product_variant_id,
    item.sku,
    item.name,
    item.brand ?? null,
    item.variantName ?? null,
    item.unitOfMeasure,
    item.unitPrice,
    item.discountPercentage ?? 0,
    (item.extras ?? [])
      .map((extra) => JSON.stringify([extra.description, extra.unitPrice]))
      .sort(compareText),
  ]);
}

function validateRow(row: RemittancePlanRow, seen: Set<string>) {
  if (!(row.source.id && row.source.orderId) || seen.has(row.source.id)) {
    throw new Error("El plan contiene un origen inválido o repetido.");
  }
  seen.add(row.source.id);
  const { item } = row;
  const values = [item.quantity, item.unitPrice, item.subtotal];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    item.quantity <= 0 ||
    truncateToDecimals(item.quantity, 6) !== item.quantity ||
    !item.name.trim()
  ) {
    throw new Error("Un producto tiene cantidades o importes inválidos.");
  }
  if (
    (item.weightQuantity != null &&
      (!Number.isFinite(item.weightQuantity) || item.weightQuantity < 0)) ||
    (item.discountPercentage != null &&
      (!Number.isFinite(item.discountPercentage) ||
        item.discountPercentage < 0 ||
        item.discountPercentage > 100)) ||
    (item.extras ?? []).some(
      (extra) => !Number.isFinite(extra.unitPrice) || extra.unitPrice < 0
    )
  ) {
    throw new Error("Un producto tiene peso, descuentos o extras inválidos.");
  }
}

/** Pure planner: stable ordering, whole source lines, no IDs or numbers consumed. */
export function planRemittanceDocuments(
  rows: RemittancePlanRow[]
): PlannedRemittanceDocument[] {
  if (!rows.length) {
    throw new Error("No hay productos para documentar en este despacho.");
  }
  const seen = new Set<string>();
  const groups = new Map<string, PlannedRemittanceLine>();
  // Fixed source order also makes accumulated decimal remainders deterministic.
  for (const row of [...rows].sort((a, b) =>
    compareText(a.source.id, b.source.id)
  )) {
    validateRow(row, seen);
    const { item, source } = row;
    const key = groupingKey(row);
    const origin = {
      order_id: source.orderId,
      quote_item_id: source.id,
      quantity: item.quantity,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.quantity = truncateToDecimals(
        existing.quantity + item.quantity,
        6
      );
      existing.subtotal = truncateToDecimals(
        existing.subtotal + item.subtotal,
        6
      );
      existing.sources.push(origin);
    } else {
      groups.set(key, {
        line_position: 1,
        product_id: source.product_id,
        product_variant_id: source.product_variant_id,
        sku: item.sku,
        product_name: item.name,
        brand: item.brand ?? null,
        variant_name: item.variantName ?? null,
        unit_of_measure: item.unitOfMeasure,
        quantity: item.quantity,
        weight_quantity:
          item.weightQuantity == null
            ? null
            : truncateToDecimals(item.weightQuantity, 6),
        unit_price: truncateToDecimals(item.unitPrice, 6),
        subtotal: truncateToDecimals(item.subtotal, 6),
        discount_percentage:
          item.discountPercentage == null
            ? null
            : truncateToDecimals(item.discountPercentage, 4),
        extras_snapshot: (item.extras ?? []).map((extra) => ({
          description: extra.description,
          unitPrice: truncateToDecimals(extra.unitPrice, 6),
        })),
        sources: [origin],
      });
    }
  }
  const lines = [...groups.values()].sort((a, b) =>
    compareText(
      JSON.stringify([
        a.product_name,
        a.variant_name,
        a.sku,
        a.sources[0].quote_item_id,
      ]),
      JSON.stringify([
        b.product_name,
        b.variant_name,
        b.sku,
        b.sources[0].quote_item_id,
      ])
    )
  );
  const documents: PlannedRemittanceDocument[] = [];
  for (
    let start = 0;
    start < lines.length;
    start += REMITTANCE_MASK_ITEMS_PER_PAGE
  ) {
    const page = lines
      .slice(start, start + REMITTANCE_MASK_ITEMS_PER_PAGE)
      .map((line, index) => ({ ...line, line_position: index + 1 }));
    const subtotal = truncateMoney(
      page.reduce((sum, line) => sum + line.subtotal, 0)
    );
    const discountTotal = truncateMoney(
      page.reduce(
        (sum, line) =>
          sum + line.subtotal * ((line.discount_percentage ?? 0) / 100),
        0
      )
    );
    const total = truncateMoney(subtotal - discountTotal);
    documents.push({
      position: documents.length + 1,
      lines: page,
      subtotal,
      discountTotal,
      total,
      suggestedDeclaredValue: truncateMoney(total * 0.7),
    });
  }
  return documents;
}
