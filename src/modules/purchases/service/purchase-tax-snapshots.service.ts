import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import type { createClient } from "@/lib/supabase/server";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";
import {
  buildItemizedTaxPlan,
  type ItemizedTaxPlan,
  type ItemTaxInput,
  type ItemTaxSource,
  type TaxableItemLine,
} from "@/modules/taxes/item-tax-calculations";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import type { Database } from "@/types/supabase";

type Client = Awaited<ReturnType<typeof createClient>>;

export type PurchaseTaxLine = {
  id: string;
  product_id: string;
  subtotal: number;
  taxes?: ItemTaxInput[];
};

type RequestedTax = {
  taxId: string;
  name: string;
  rate: number;
  taxCodeSnapshot?: string | null;
  source?: ItemTaxSource;
};

/** Resolve client-selected taxes against this tenant's catalog, retaining already-frozen selections. */
export async function resolvePurchaseTaxSelections(params: {
  supabase: Client;
  orgId: string;
  lines: Array<{ id?: string; taxes?: ItemTaxInput[] }>;
  fallbackTaxes: RequestedTax[];
  savedLineTaxes?: Map<string, ItemTaxInput[]>;
  savedFallbackTaxes?: ItemTaxInput[];
}): Promise<{
  lineTaxes: Array<ItemTaxInput[] | undefined>;
  fallbackTaxes: ItemTaxInput[];
}> {
  const requested = [
    ...params.lines.flatMap((line) => line.taxes ?? []),
    ...params.fallbackTaxes,
  ];
  for (const tax of requested) {
    if (!tax || typeof tax.taxId !== "string" || !Number.isFinite(tax.rate)) {
      throw new Error("Un impuesto seleccionado tiene un formato inválido");
    }
  }
  const taxIds = [
    ...new Set(requested.map((tax) => tax.taxId).filter(Boolean)),
  ];
  const { data, error } = taxIds.length
    ? await params.supabase
        .from("taxes")
        .select("id, name, rate, code, is_active")
        .eq("organization_id", params.orgId)
        .in("id", taxIds)
    : { data: [], error: null };
  if (error) {
    throw new Error(`Error al validar impuestos: ${error.message}`);
  }
  const catalog = new Map((data ?? []).map((tax) => [tax.id, tax]));
  const resolve = (
    selected: RequestedTax[],
    saved: ItemTaxInput[],
    source: "manual" | "fallback"
  ) => {
    const used = new Set<string>();
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: preserves frozen tax selections while validating new catalog IDs.
    return selected.map((choice): ItemTaxInput => {
      const key =
        choice.taxId ||
        `${choice.name}:${choice.rate}:${choice.taxCodeSnapshot ?? ""}`;
      if (used.has(key)) {
        throw new Error("El mismo impuesto no puede repetirse en un ítem");
      }
      used.add(key);
      const frozen = saved.find((tax) =>
        choice.taxId
          ? tax.taxId === choice.taxId
          : tax.taxId === "" &&
            tax.name === choice.name &&
            tax.rate === choice.rate
      );
      const actual = catalog.get(choice.taxId);
      if (frozen) {
        return {
          ...frozen,
          taxId: actual ? frozen.taxId : "",
          taxCodeSnapshot:
            frozen.taxCodeSnapshot ??
            normalizeArcaTaxCode(actual?.code) ??
            null,
          source:
            source === "fallback" ? "fallback" : (frozen.source ?? "manual"),
        };
      }
      if (!actual?.is_active) {
        throw new Error(
          "El impuesto seleccionado no está activo para esta organización"
        );
      }
      return {
        taxId: actual.id,
        name: actual.name,
        rate: Number(actual.rate),
        taxCodeSnapshot: normalizeArcaTaxCode(actual.code) ?? null,
        source,
      };
    });
  };
  return {
    lineTaxes: params.lines.map((line) =>
      line.taxes === undefined
        ? undefined
        : resolve(
            line.taxes,
            params.savedLineTaxes?.get(line.id ?? "") ?? [],
            "manual"
          )
    ),
    fallbackTaxes: resolve(
      params.fallbackTaxes,
      params.savedFallbackTaxes ?? [],
      "fallback"
    ),
  };
}

export type PurchaseItemTaxRow =
  Database["public"]["Tables"]["purchase_order_item_taxes"]["Row"];
export type ValidatedPurchaseItemTaxRow = Omit<PurchaseItemTaxRow, "source"> & {
  source: ItemTaxSource;
};

const taxSourceSchema = z.enum([
  "product",
  "manual",
  "fallback",
  "legacy_prorated",
]);

const itemTaxInputsSchema = z.array(
  z.object({
    taxId: z.string(),
    name: z.string().min(1),
    rate: z.number().finite(),
    taxCodeSnapshot: z.string().nullable().optional(),
    source: taxSourceSchema.optional(),
  })
);

export function parsePurchaseTaxInputs(value: unknown): ItemTaxInput[] {
  const result = itemTaxInputsSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "Los impuestos guardados en la compra tienen un formato inválido"
    );
  }
  return result.data;
}

export function tryParsePurchaseTaxInputs(
  value: unknown
): ItemTaxInput[] | null {
  const result = itemTaxInputsSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function toPurchaseItemTaxInput(
  row: ValidatedPurchaseItemTaxRow
): ItemTaxInput {
  return {
    taxId: row.tax_id ?? "",
    name: row.name,
    rate: row.rate,
    taxCodeSnapshot: row.tax_code_snapshot,
    source: row.source,
  };
}

export async function getPurchaseItemTaxRows(
  supabase: Client,
  orgId: string,
  orderId: string
): Promise<ValidatedPurchaseItemTaxRow[]> {
  const { data, error } = await supabase
    .from("purchase_order_item_taxes")
    .select("*")
    .eq("purchase_order_id", orderId)
    .eq("organization_id", orgId);
  if (error) {
    throw new Error(`Error al leer impuestos por ítem: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    ...row,
    source: taxSourceSchema.parse(row.source),
  }));
}

export async function buildPurchaseTaxPlan(params: {
  supabase: Client;
  orgId: string;
  lines: PurchaseTaxLine[];
  globalDiscountAmount: number;
  fallbackTaxes?: ItemTaxInput[];
}): Promise<ItemizedTaxPlan> {
  const productTaxes = await getProductTaxAssignments({
    supabase: params.supabase,
    orgId: params.orgId,
    productIds: params.lines.map((line) => line.product_id),
  });
  const lines: TaxableItemLine[] = params.lines.map((line) => ({
    lineId: line.id,
    productId: line.product_id,
    netAmount: truncateMoney(line.subtotal),
    taxes:
      line.taxes === undefined ? productTaxes.get(line.product_id) : line.taxes,
  }));
  const plan = buildItemizedTaxPlan({
    lines,
    globalDiscountAmount: params.globalDiscountAmount,
    fallbackTaxes: params.fallbackTaxes,
  });
  if (
    plan.itemTaxes.some(
      (tax) =>
        !Number.isFinite(tax.rate) ||
        tax.rate < 0 ||
        tax.rate > 1000 ||
        tax.baseAmount < 0 ||
        tax.taxAmount < 0
    )
  ) {
    throw new Error("Los impuestos calculados para la compra son inválidos");
  }
  return plan;
}

export async function persistPurchaseFiscalState(params: {
  supabase: Client;
  orgId: string;
  orderId: string;
  mode: "replace" | "confirm" | "receipt" | "receipt_legacy";
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_quantity: number | null;
    unit_cost: number;
    subtotal: number;
    variant_stocks?: unknown;
    tax_override?: ItemTaxInput[] | null;
  }>;
  plan: ItemizedTaxPlan;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  fallbackTaxes: ItemTaxInput[];
  supplierId: string | null;
  purchaseDate: string;
  expirationDate: string | null;
  remittanceNumber: string | null;
  nextStatus?: "ORDERED";
  payableDueDate?: string | null;
}): Promise<Database["public"]["Tables"]["purchase_orders"]["Row"]> {
  const total = truncateMoney(
    Math.max(
      0,
      params.subtotal - params.discountAmount + params.plan.totalTaxAmount
    )
  );
  // The RPC becomes part of the generated Supabase types after its migration is applied.
  const client = params.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: Database["public"]["Tables"]["purchase_orders"]["Row"] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await client.rpc("persist_purchase_fiscal_state", {
    p_org_id: params.orgId,
    p_purchase_order_id: params.orderId,
    p_mode: params.mode,
    p_items: params.items.map((item) => ({
      ...item,
      variant_stocks: item.variant_stocks ?? null,
      tax_override: item.tax_override ?? null,
    })),
    p_item_taxes: params.plan.itemTaxes.map((tax) => ({
      line_id: tax.lineId,
      product_id: tax.productId,
      tax_id: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      base_amount: truncateMoney(tax.baseAmount),
      tax_amount: truncateMoney(tax.taxAmount),
      tax_code_snapshot: tax.taxCodeSnapshot,
      source: tax.source,
    })),
    p_order_taxes: params.plan.aggregateTaxes.map((tax) => ({
      tax_id: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      base_amount: truncateMoney(tax.baseAmount),
      tax_amount: truncateMoney(tax.taxAmount),
      tax_code_snapshot: tax.taxCodeSnapshot,
    })),
    p_subtotal: params.subtotal,
    p_tax_amount: params.plan.totalTaxAmount,
    p_discount_percentage: params.discountPercentage,
    p_discount_amount: params.discountAmount,
    p_total_amount: total,
    p_fallback_taxes: params.fallbackTaxes,
    p_supplier_id: params.supplierId,
    p_purchase_date: params.purchaseDate,
    p_expiration_date: params.expirationDate,
    p_remittance_number: params.remittanceNumber,
    p_next_status: params.nextStatus ?? null,
    p_payable_due_date: params.payableDueDate ?? null,
  });
  if (error || !data) {
    throw new Error(
      `No se pudo guardar la compra de forma atómica: ${error?.message ?? "No encontrada"}`
    );
  }
  return data;
}
