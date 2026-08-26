import { truncateMoney } from "@/lib/decimal";
import { requireAuth } from "@/lib/supabase/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { toDateOnlyString } from "@/modules/sales/utils/date";
import type {
  ItemTaxInput,
  ItemTaxSource,
} from "@/modules/taxes/item-tax-calculations";
import type { Database } from "@/types/supabase";
import type { QuoteWithCustomer } from "../actions/get-quotes.action";
import type {
  CreateQuoteInput,
  PaginatedResult,
  QuoteItemTaxRow,
  QuoteMetrics,
  QuotePaginationParams,
  QuoteRow,
  QuoteStatus,
  QuoteTaxRow,
  UpdateQuoteInput,
} from "../types";
import {
  groupQuoteItemTaxesByLine,
  type QuoteLineTaxEntries,
  type QuoteTaxLine,
} from "../utils/quote-line-calcs";
import { buildQuoteTotals } from "./quote-tax.service";

type QuotesScope = "all" | "own";

type QuotesAccessContext = {
  scope: QuotesScope;
  userId: string | null;
};

function canViewAllQuotes(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("quotes.read.all") ||
    permissions.includes("quotes.manage.all")
  );
}

export async function resolveQuotesAccessContext(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  orgSlug: string
): Promise<QuotesAccessContext> {
  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    scope: canViewAllQuotes(permissions) ? "all" : "own",
    userId: authData.user?.id ?? null,
  };
}

type SupabaseClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

function clampPercentage(value: number | null | undefined): number {
  return Math.min(Math.max(0, value ?? 0), 100);
}

function computeVariantDiscount(
  item: CreateQuoteInput["items"][number],
  quantity: number
): number {
  const extrasTotal = truncateMoney(
    (item.extras ?? []).reduce((acc, extra) => acc + extra.price, 0)
  );
  const gross = truncateMoney(
    quantity * item.unitPrice + extrasTotal * quantity
  );
  return truncateMoney(
    (gross * clampPercentage(item.discountPercentage)) / 100
  );
}

async function insertQuoteItemExtras(
  supabase: SupabaseClient,
  itemId: string,
  extras: CreateQuoteInput["items"][number]["extras"]
): Promise<void> {
  if (!extras || extras.length === 0) {
    return;
  }

  const extrasInserts = extras.map((extra) => ({
    quote_item_id: itemId,
    description: extra.description,
    price: extra.price,
  }));

  const { error: extrasError } = await supabase
    .from("quote_item_extras")
    .insert(extrasInserts);

  if (extrasError) {
    throw new Error(`No se pudieron crear extras: ${extrasError.message}`);
  }
}

async function insertQuoteTaxes(
  supabase: SupabaseClient,
  quoteId: string,
  organizationId: string,
  aggregateTaxes: Array<{
    taxId: string | null;
    name: string;
    rate: number;
    baseAmount: number;
    taxAmount: number;
    taxCodeSnapshot: string | null;
  }>
): Promise<void> {
  if (aggregateTaxes.length === 0) {
    return;
  }

  const { error: taxesError } = await supabase.from("quote_taxes").insert(
    aggregateTaxes.map((tax) => ({
      organization_id: organizationId,
      quote_id: quoteId,
      tax_id: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.baseAmount,
      tax_amount: tax.taxAmount,
      tax_code_snapshot: tax.taxCodeSnapshot,
    }))
  );

  if (taxesError) {
    throw new Error(
      `No se pudieron crear los impuestos: ${taxesError.message}`
    );
  }
}

async function deleteQuoteTaxes(
  supabase: SupabaseClient,
  quoteId: string
): Promise<void> {
  const { error } = await supabase
    .from("quote_taxes")
    .delete()
    .eq("quote_id", quoteId);

  if (error) {
    throw new Error(`Error al eliminar impuestos: ${error.message}`);
  }
}

// biome-ignore lint/nursery/useMaxParams: internal helper wiring DB inserts
async function insertQuoteItemVariant(
  supabase: SupabaseClient,
  quoteId: string,
  organizationId: string,
  item: CreateQuoteInput["items"][number],
  variant: CreateQuoteInput["items"][number]["variants"][number],
  lineTaxes: QuoteLineTaxEntries[number] | undefined
): Promise<string> {
  const subtotal = truncateMoney(variant.quantity * item.unitPrice);
  const discountPercentage =
    item.discountPercentage != null && item.discountPercentage > 0
      ? clampPercentage(item.discountPercentage)
      : null;
  const discountAmount = discountPercentage
    ? computeVariantDiscount(item, variant.quantity)
    : null;
  const description =
    item.productName && variant.talle
      ? `${item.productName} - ${variant.talle} / ${variant.color}`
      : (item.description ?? null);

  const { data: itemData, error: itemError } = await supabase
    .from("quote_items")
    .insert({
      quote_id: quoteId,
      product_id: item.productId ?? null,
      description,
      quantity: variant.quantity,
      unit_price: item.unitPrice,
      subtotal,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      product_variant_id: variant.productVariantId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (itemError || !itemData?.id) {
    throw new Error(
      `No se pudo crear item del presupuesto: ${itemError?.message ?? "Error desconocido"}`
    );
  }

  if (lineTaxes && lineTaxes.taxes.length > 0) {
    const taxInserts = lineTaxes.taxes.map((tax) => ({
      organization_id: organizationId,
      quote_id: quoteId,
      quote_item_id: itemData.id,
      product_id: lineTaxes.productId,
      tax_id: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.baseAmount,
      tax_amount: tax.taxAmount,
      tax_code_snapshot: tax.taxCodeSnapshot,
      source: tax.source,
    }));

    const { error: itemTaxesError } = await supabase
      .from("quote_item_taxes")
      .insert(taxInserts);

    if (itemTaxesError) {
      throw new Error(
        `No se pudieron crear los impuestos del item: ${itemTaxesError.message}`
      );
    }
  }

  return itemData.id;
}

// biome-ignore lint/nursery/useMaxParams: internal helper wiring DB inserts
async function insertQuoteItemsAndExtras(
  supabase: SupabaseClient,
  quoteId: string,
  organizationId: string,
  items: CreateQuoteInput["items"],
  taxesByLine: Map<string, QuoteLineTaxEntries[number]>
): Promise<void> {
  for (const [itemIndex, item] of items.entries()) {
    for (const [variantIndex, variant] of (item.variants || []).entries()) {
      const lineId = `item-${itemIndex}-variant-${variantIndex}`;
      const itemId = await insertQuoteItemVariant(
        supabase,
        quoteId,
        organizationId,
        item,
        variant,
        taxesByLine.get(lineId)
      );
      await insertQuoteItemExtras(supabase, itemId, item.extras);
    }
  }
}

export async function createQuote(input: CreateQuoteInput): Promise<string> {
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }

  const { supabase, userId } = auth;

  const organization = await getOrganizationBySlug(input.orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const totals = await buildQuoteTotals({
    supabase,
    orgId: organization.id,
    items: input.items,
    globalDiscountPercentage: input.globalDiscountPercentage ?? null,
    fallbackTaxes: input.taxes,
  });
  const taxesByLine = new Map(
    groupQuoteItemTaxesByLine(totals.taxPlan).map((entry) => [
      entry.lineId,
      entry,
    ])
  );

  const { data: quoteData, error: quoteError } = await supabase
    .from("quotes")
    .insert(
      buildQuoteInsertPayload({
        organizationId: organization.id,
        input,
        userId,
        totals,
      }) as unknown as Database["public"]["Tables"]["quotes"]["Insert"]
    )
    .select("id")
    .maybeSingle();

  if (quoteError || !quoteData?.id) {
    throw new Error(
      `No se pudo crear el presupuesto: ${quoteError?.message ?? "Error desconocido"}`
    );
  }

  await insertQuoteItemsAndExtras(
    supabase,
    quoteData.id,
    organization.id,
    input.items,
    taxesByLine
  );

  await insertQuoteTaxes(
    supabase,
    quoteData.id,
    organization.id,
    totals.taxPlan.aggregateTaxes
  );

  return quoteData.id;
}

function buildQuoteInsertPayload({
  organizationId,
  input,
  userId,
  totals,
}: {
  organizationId: string;
  input: CreateQuoteInput;
  userId: string;
  totals: Awaited<ReturnType<typeof buildQuoteTotals>>;
}) {
  return {
    organization_id: organizationId,
    customer_id: input.customerId,
    status: "DRAFT",
    total_amount: totals.totalAmount,
    sub_total: totals.subTotal,
    total_tax_amount: totals.totalTaxAmount,
    global_discount_percentage: input.globalDiscountPercentage ?? null,
    global_discount_amount: totals.globalDiscountAmount,
    currency: input.currency ?? "ARS",
    exchange_rate: input.exchangeRate ?? null,
    invoice_type: input.invoiceType ?? "NOTA_DE_VENTA",
    payment_condition: input.paymentCondition ?? null,
    observations: input.observations ?? null,
    created_by: userId,
    advance_payment: input.advancePaymentEnabled ?? false,
    advance_payment_percentage: input.advancePaymentEnabled
      ? (input.advancePaymentPercentage ?? null)
      : null,
    target_margin_list_id: input.targetMarginListId ?? null,
  };
}

async function fetchQuoteForConversion(
  supabase: SupabaseClient,
  quoteId: string,
  organizationId: string
) {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  if (error || !quote) {
    throw new Error("Presupuesto no encontrado");
  }

  if (quote.status !== ("APPROVED" satisfies QuoteStatus)) {
    throw new Error(
      "El presupuesto debe estar aprobado para convertirlo en nota de venta"
    );
  }

  if (quote.organization_id !== organizationId) {
    throw new Error("El presupuesto no pertenece a esta organización");
  }

  return quote;
}

async function fetchQuoteItemsWithExtras(
  supabase: SupabaseClient,
  quoteId: string
) {
  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId);

  if (itemsError) {
    throw new Error(
      `Error al obtener items del presupuesto: ${itemsError.message}`
    );
  }

  const itemIds = (items ?? []).map((item) => item.id);
  const extrasByItemId: Record<
    string,
    Array<{ description: string; price: number }>
  > = {};

  if (itemIds.length > 0) {
    const { data: allExtras, error: extrasError } = await supabase
      .from("quote_item_extras")
      .select("*")
      .in("quote_item_id", itemIds);

    if (extrasError) {
      throw new Error(
        `Error al obtener extras del presupuesto: ${extrasError.message}`
      );
    }

    for (const extra of allExtras ?? []) {
      if (!extrasByItemId[extra.quote_item_id]) {
        extrasByItemId[extra.quote_item_id] = [];
      }
      extrasByItemId[extra.quote_item_id].push({
        description: extra.description,
        price: extra.price,
      });
    }
  }

  return { items: items ?? [], extrasByItemId };
}

type InsertSalesOrderItemParams = {
  supabase: SupabaseClient;
  organizationId: string;
  salesOrderId: string;
  quoteItem: Database["public"]["Tables"]["quote_items"]["Row"];
  extras: Array<{ description: string; price: number }>;
};

async function insertSalesOrderItemWithExtras(
  params: InsertSalesOrderItemParams
): Promise<string> {
  const { supabase, organizationId, salesOrderId, quoteItem, extras } = params;

  const { data: newItem, error: newItemError } = await supabase
    .from("sales_order_items")
    .insert({
      organization_id: organizationId,
      sales_order_id: salesOrderId,
      product_id: quoteItem.product_id,
      description: quoteItem.description,
      quantity: quoteItem.quantity,
      unit_price: quoteItem.unit_price,
      base_price: quoteItem.unit_price,
      discount_percentage: quoteItem.discount_percentage,
      discount_amount: quoteItem.discount_amount,
      subtotal: quoteItem.subtotal,
      product_variant_id: quoteItem.product_variant_id ?? null,
      unit_quantity: null,
      is_adjustment: null,
      quote_item_id: quoteItem.id,
    })
    .select("id")
    .maybeSingle();

  if (newItemError || !newItem?.id) {
    throw new Error(
      `No se pudo crear el item de la nota de venta: ${newItemError?.message ?? "Error desconocido"}`
    );
  }

  if (extras.length > 0) {
    const extrasInserts = extras.map((extra) => ({
      sales_order_item_id: newItem.id,
      name_snapshot: extra.description,
      price_snapshot: extra.price,
      cost_snapshot: 0,
      type_snapshot: "quote_extra",
      product_extra_id: null,
    }));

    const { error: extrasInsertError } = await supabase
      .from("sales_order_item_extras")
      .insert(extrasInserts);

    if (extrasInsertError) {
      throw new Error(
        `No se pudieron crear los extras: ${extrasInsertError.message}`
      );
    }
  }

  return newItem.id;
}

async function rollbackSalesOrder(
  supabase: SupabaseClient,
  salesOrderId: string
) {
  await supabase
    .from("sales_order_items")
    .delete()
    .eq("sales_order_id", salesOrderId);

  await supabase.from("sales_orders").delete().eq("id", salesOrderId);
}

async function deleteQuoteItems(
  supabase: SupabaseClient,
  quoteId: string
): Promise<void> {
  const { data: items } = await supabase
    .from("quote_items")
    .select("id")
    .eq("quote_id", quoteId);

  if (items && items.length > 0) {
    const itemIds = items.map((i) => i.id);

    const { error: extrasError } = await supabase
      .from("quote_item_extras")
      .delete()
      .in("quote_item_id", itemIds);

    if (extrasError) {
      throw new Error(`Error al eliminar extras: ${extrasError.message}`);
    }

    const { error: itemsError } = await supabase
      .from("quote_items")
      .delete()
      .eq("quote_id", quoteId);

    if (itemsError) {
      throw new Error(`Error al eliminar items: ${itemsError.message}`);
    }
  }
}

async function validateQuoteUpdate(
  supabase: SupabaseClient,
  quoteId: string,
  orgId: string
): Promise<QuoteRow> {
  const { data: existingQuote, error: fetchError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  if (fetchError || !existingQuote) {
    throw new Error("Presupuesto no encontrado");
  }

  if (existingQuote.organization_id !== orgId) {
    throw new Error("El presupuesto no pertenece a esta organización");
  }

  if (existingQuote.status !== "DRAFT" && existingQuote.status !== "SENT") {
    throw new Error(
      "Solo se pueden editar presupuestos en estado Borrador o Enviado"
    );
  }

  return existingQuote as QuoteRow;
}

async function createCancelledVersion(
  supabase: SupabaseClient,
  quoteId: string,
  context: {
    orgId: string;
    userId: string;
  }
): Promise<void> {
  const { data: original, error: fetchError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  if (fetchError || !original) {
    throw new Error("Presupuesto original no encontrado");
  }

  const { data: cancelledQuote, error: createError } = await (supabase
    .from("quotes")
    .insert({
      organization_id: context.orgId,
      customer_id: original.customer_id,
      created_by: context.userId,
      status: "CANCELLED",
      total_amount: original.total_amount,
      sub_total: original.sub_total,
      total_tax_amount: original.total_tax_amount,
      global_discount_percentage: original.global_discount_percentage,
      global_discount_amount: original.global_discount_amount,
      currency: original.currency,
      exchange_rate: original.exchange_rate ?? null,
      payment_condition: original.payment_condition,
      observations: original.observations,
      purchase_order_file: original.purchase_order_file,
      design_file_url: original.design_file_url,
      target_margin_list_id: original.target_margin_list_id,
      advance_payment:
        ((original as Record<string, unknown>).advance_payment as boolean) ??
        false,
      advance_payment_percentage: (original as Record<string, unknown>)
        .advance_payment_percentage as number | null,
      parent_quote_id: quoteId,
    })
    .select("id")
    .single() as unknown as Promise<{
    data: { id: string } | null;
    error: Error | null;
  }>);

  if (createError || !cancelledQuote) {
    throw new Error(
      `No se pudo crear la versión cancelada: ${createError?.message ?? "Error desconocido"}`
    );
  }

  await copyQuoteItems(supabase, quoteId, cancelledQuote.id);
  await copyQuoteTaxes(supabase, quoteId, cancelledQuote.id, context.orgId);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: copy logic iterates items and their taxes
async function copyQuoteItems(
  supabase: SupabaseClient,
  sourceQuoteId: string,
  targetQuoteId: string
): Promise<void> {
  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("*, quote_item_extras(*), quote_item_taxes(*)")
    .eq("quote_id", sourceQuoteId);

  if (itemsError) {
    throw new Error(
      `Error al obtener items del presupuesto: ${itemsError.message}`
    );
  }

  if (!items) {
    return;
  }

  for (const item of items) {
    const { data: newItem, error: itemInsertError } = await supabase
      .from("quote_items")
      .insert({
        quote_id: targetQuoteId,
        product_id: item.product_id,
        product_variant_id: item.product_variant_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        discount_percentage: item.discount_percentage,
        discount_amount: item.discount_amount,
      })
      .select("id")
      .single();

    if (itemInsertError || !newItem) {
      throw new Error(
        `Error al copiar item: ${itemInsertError?.message ?? "Error desconocido"}`
      );
    }

    if (item.quote_item_extras?.length > 0) {
      const extrasToInsert = item.quote_item_extras.map((e) => ({
        quote_item_id: newItem.id,
        description: e.description,
        price: e.price,
      }));

      const { error: extrasError } = await supabase
        .from("quote_item_extras")
        .insert(extrasToInsert);

      if (extrasError) {
        throw new Error(`Error al copiar extras: ${extrasError.message}`);
      }
    }

    if (item.quote_item_taxes?.length > 0) {
      const itemTaxesToInsert = item.quote_item_taxes.map((tax) => ({
        organization_id: tax.organization_id,
        quote_id: targetQuoteId,
        quote_item_id: newItem.id,
        product_id: tax.product_id,
        tax_id: tax.tax_id,
        name: tax.name,
        rate: tax.rate,
        base_amount: tax.base_amount,
        tax_amount: tax.tax_amount,
        tax_code_snapshot: tax.tax_code_snapshot,
        source: tax.source,
      }));

      const { error: itemTaxesError } = await supabase
        .from("quote_item_taxes")
        .insert(itemTaxesToInsert);

      if (itemTaxesError) {
        throw new Error(
          `Error al copiar impuestos del item: ${itemTaxesError.message}`
        );
      }
    }
  }
}

async function copyQuoteTaxes(
  supabase: SupabaseClient,
  sourceQuoteId: string,
  targetQuoteId: string,
  organizationId: string
): Promise<void> {
  const { data: taxes, error: taxesError } = await supabase
    .from("quote_taxes")
    .select("*")
    .eq("quote_id", sourceQuoteId);

  if (taxesError) {
    throw new Error(
      `Error al obtener impuestos del presupuesto: ${taxesError.message}`
    );
  }

  if (!taxes || taxes.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("quote_taxes").insert(
    taxes.map((tax) => ({
      organization_id: organizationId,
      quote_id: targetQuoteId,
      tax_id: tax.tax_id,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.base_amount,
      tax_amount: tax.tax_amount,
      tax_code_snapshot: tax.tax_code_snapshot,
    }))
  );

  if (insertError) {
    throw new Error(`Error al copiar impuestos: ${insertError.message}`);
  }
}

function buildUpdatePayload(
  input: UpdateQuoteInput,
  existing: QuoteRow
): Record<string, unknown> {
  return {
    customer_id: input.customerId ?? undefined,
    currency: input.currency ?? undefined,
    exchange_rate:
      input.exchangeRate !== undefined ? input.exchangeRate : undefined,
    payment_condition:
      input.paymentCondition !== undefined
        ? input.paymentCondition
        : existing.payment_condition,
    observations:
      input.observations !== undefined ? input.observations : undefined,
    purchase_order_file:
      input.purchaseOrderFile !== undefined
        ? input.purchaseOrderFile
        : undefined,
    design_file_url:
      input.designFileUrl !== undefined ? input.designFileUrl : undefined,
    advance_payment:
      input.advancePaymentEnabled !== undefined
        ? input.advancePaymentEnabled
        : undefined,
    advance_payment_percentage:
      input.advancePaymentPercentage !== undefined
        ? input.advancePaymentPercentage
        : undefined,
    invoice_type:
      input.invoiceType !== undefined ? input.invoiceType : undefined,
    updated_at: new Date().toISOString(),
  };
}

function hasMetadataChanged(
  input: UpdateQuoteInput,
  existing: QuoteRow
): boolean {
  const raw = existing as unknown as Record<string, unknown>;
  const checks: Array<{ inputVal: unknown; dbVal: unknown }> = [
    { inputVal: input.paymentCondition, dbVal: existing.payment_condition },
    { inputVal: input.observations, dbVal: existing.observations },
    {
      inputVal: input.purchaseOrderFile,
      dbVal: existing.purchase_order_file,
    },
    { inputVal: input.designFileUrl, dbVal: existing.design_file_url },
    { inputVal: input.advancePaymentEnabled, dbVal: raw.advance_payment },
    { inputVal: input.invoiceType, dbVal: raw.invoice_type },
    {
      inputVal: input.advancePaymentPercentage,
      dbVal: raw.advance_payment_percentage,
    },
    {
      inputVal: input.globalDiscountPercentage,
      dbVal: raw.global_discount_percentage,
    },
  ];

  return checks.some(
    ({ inputVal, dbVal }) =>
      inputVal !== undefined && inputVal !== (dbVal ?? null)
  );
}

function quoteTaxRowsToFallbackInputs(taxes: QuoteTaxRow[]): ItemTaxInput[] {
  return taxes
    .filter((tax) => tax.tax_id !== null)
    .map((tax) => ({
      taxId: tax.tax_id as string,
      name: tax.name,
      rate: tax.rate,
      taxCodeSnapshot: tax.tax_code_snapshot,
      source: "fallback" as const,
    }));
}

function taxesKey(taxes: ItemTaxInput[]): string {
  return taxes
    .map((tax) => `${tax.taxId}:${tax.name}:${tax.rate}`)
    .sort()
    .join("|");
}

async function buildQuoteTaxLinesFromRows(
  supabase: SupabaseClient,
  quoteId: string
): Promise<QuoteTaxLine[]> {
  const { items, extrasByItemId } = await fetchQuoteItemsWithExtras(
    supabase,
    quoteId
  );
  const itemTaxesByItemId = await fetchQuoteItemTaxRowsByItem(
    supabase,
    quoteId
  );

  return items.map((row) => {
    const extrasTotal = truncateMoney(
      (extrasByItemId[row.id] ?? []).reduce(
        (sum, extra) => sum + extra.price,
        0
      )
    );
    const gross = truncateMoney(
      row.quantity * row.unit_price + extrasTotal * row.quantity
    );
    const discount = truncateMoney(
      (gross * clampPercentage(row.discount_percentage)) / 100
    );

    const itemTaxes = (itemTaxesByItemId.get(row.id) ?? [])
      .filter((tax) => tax.tax_id !== null)
      .map(
        (tax): ItemTaxInput => ({
          taxId: tax.tax_id as string,
          name: tax.name,
          rate: tax.rate,
          taxCodeSnapshot: tax.tax_code_snapshot,
          source: tax.source as ItemTaxSource,
        })
      );

    return {
      lineId: `row-${row.id}`,
      productId: row.product_id,
      gross,
      discount,
      net: truncateMoney(Math.max(0, gross - discount)),
      taxes: itemTaxes.length > 0 ? itemTaxes : undefined,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: update flow recomputes totals and re-inserts items
export async function updateQuote(
  quoteId: string,
  input: UpdateQuoteInput
): Promise<void> {
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }

  const { supabase, userId } = auth;

  const organization = await getOrganizationBySlug(input.orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const existing = await validateQuoteUpdate(
    supabase,
    quoteId,
    organization.id
  );

  const metadataChanged = hasMetadataChanged(input, existing);
  const itemsChanged = input.items !== undefined;
  const existingTaxRows = await fetchQuoteTaxRows(supabase, quoteId);
  const existingFallbackTaxes = quoteTaxRowsToFallbackInputs(existingTaxRows);
  const taxesChanged =
    input.taxes !== undefined &&
    taxesKey(existingFallbackTaxes) !== taxesKey(input.taxes);
  const totalsChanged =
    itemsChanged ||
    input.globalDiscountPercentage !== undefined ||
    input.taxes !== undefined;

  if (itemsChanged || metadataChanged || taxesChanged) {
    await createCancelledVersion(supabase, quoteId, {
      orgId: organization.id,
      userId,
    });
  }

  const updateData = buildUpdatePayload(input, existing);

  const globalDiscountPercentage =
    input.globalDiscountPercentage !== undefined
      ? input.globalDiscountPercentage
      : (existing.global_discount_percentage ?? null);

  let totals: Awaited<ReturnType<typeof buildQuoteTotals>> | undefined;

  if (totalsChanged) {
    if (itemsChanged) {
      const newItems = input.items as CreateQuoteInput["items"];
      totals = await buildQuoteTotals({
        supabase,
        orgId: organization.id,
        items: newItems,
        globalDiscountPercentage,
        fallbackTaxes: input.taxes,
      });
    } else {
      const rows = await buildQuoteTaxLinesFromRows(supabase, quoteId);
      totals = await buildQuoteTotals({
        supabase,
        orgId: organization.id,
        items: [],
        globalDiscountPercentage,
        fallbackTaxes: input.taxes ?? existingFallbackTaxes,
        lines: rows,
      });
    }

    updateData.sub_total = totals.subTotal;
    updateData.total_tax_amount = totals.totalTaxAmount;
    updateData.global_discount_percentage = globalDiscountPercentage;
    updateData.global_discount_amount = totals.globalDiscountAmount;
    updateData.total_amount = totals.totalAmount;
  }

  if (itemsChanged) {
    const newItems = input.items as CreateQuoteInput["items"];
    const taxesByLine = new Map(
      (totals ? groupQuoteItemTaxesByLine(totals.taxPlan) : []).map((entry) => [
        entry.lineId,
        entry,
      ])
    );

    await deleteQuoteItems(supabase, quoteId);
    await insertQuoteItemsAndExtras(
      supabase,
      quoteId,
      organization.id,
      newItems,
      taxesByLine
    );
  }

  if (totalsChanged && totals) {
    await deleteQuoteTaxes(supabase, quoteId);
    await insertQuoteTaxes(
      supabase,
      quoteId,
      organization.id,
      totals.taxPlan.aggregateTaxes
    );
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update(updateData)
    .eq("id", quoteId);

  if (updateError) {
    throw new Error(
      `No se pudo actualizar el presupuesto: ${updateError.message}`
    );
  }
}

async function fetchQuoteTaxRows(
  supabase: SupabaseClient,
  quoteId: string
): Promise<QuoteTaxRow[]> {
  const { data, error } = await supabase
    .from("quote_taxes")
    .select("*")
    .eq("quote_id", quoteId);

  if (error) {
    throw new Error(
      `Error al obtener impuestos del presupuesto: ${error.message}`
    );
  }

  return data ?? [];
}

async function fetchQuoteItemTaxRowsByItem(
  supabase: SupabaseClient,
  quoteId: string
): Promise<Map<string, QuoteItemTaxRow[]>> {
  const { data, error } = await supabase
    .from("quote_item_taxes")
    .select("*")
    .eq("quote_id", quoteId);

  if (error) {
    throw new Error(
      `Error al obtener impuestos de los items: ${error.message}`
    );
  }

  const byItem = new Map<string, QuoteItemTaxRow[]>();
  for (const row of data ?? []) {
    const existing = byItem.get(row.quote_item_id) ?? [];
    existing.push(row);
    byItem.set(row.quote_item_id, existing);
  }

  return byItem;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: conversion keeps creation and rollback atomic at the service boundary.
export async function convertQuoteToSalesOrder(
  quoteId: string,
  orgSlug: string,
  initialStatus?: Database["public"]["Enums"]["order_status"]
): Promise<string> {
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }

  const { supabase, userId } = auth;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const quote = await fetchQuoteForConversion(
    supabase,
    quoteId,
    organization.id
  );
  const { items: quoteItems, extrasByItemId } = await fetchQuoteItemsWithExtras(
    supabase,
    quoteId
  );

  const convertRate =
    quote.currency === "USD" && quote.exchange_rate ? quote.exchange_rate : 1;
  const convertMoney = (value: number | null | undefined) =>
    truncateMoney((value ?? 0) * convertRate);

  const totalAmount = convertMoney(quote.total_amount);
  const saleDate = toDateOnlyString(new Date());

  const [quoteTaxes, itemTaxesByQuoteItemId] = await Promise.all([
    fetchQuoteTaxRows(supabase, quoteId),
    fetchQuoteItemTaxRowsByItem(supabase, quoteId),
  ]);

  const { data: salesOrder, error: salesOrderError } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organization.id,
      customer_id: quote.customer_id,
      user_id: userId,
      sale_date: saleDate,
      invoice_type: (quote.invoice_type ??
        "NOTA_DE_VENTA") as Database["public"]["Enums"]["invoice_type"],
      currency: "ARS",
      sub_total: convertMoney(quote.sub_total),
      total_amount: totalAmount,
      total_tax_amount: convertMoney(quote.total_tax_amount),
      global_discount_percentage: quote.global_discount_percentage,
      global_discount_amount: convertMoney(quote.global_discount_amount),
      status: initialStatus ?? "DRAFT",
      // A converted approved quote is the operational Preventa.  It remains a
      // draft sales order until the order flow explicitly converts it to stock
      // consuming Venta.
      preventa_status: "APROBADA",
      is_historical: false,
      observations: quote.observations,
      sales_price_list_id: quote.target_margin_list_id ?? null,
      commercial_snapshot: {
        quoteId,
        customerId: quote.customer_id,
        currency: quote.currency,
        exchangeRate: quote.exchange_rate ?? null,
        paymentCondition: quote.payment_condition ?? null,
        totalAmount,
        items: quoteItems.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productVariantId: item.product_variant_id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          subtotal: item.subtotal,
          discountAmount: item.discount_amount,
          discountPercentage: item.discount_percentage,
          extras: extrasByItemId[item.id] ?? [],
        })),
      },
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (salesOrderError || !salesOrder?.id) {
    throw new Error(
      `No se pudo crear la nota de venta: ${salesOrderError?.message ?? "Error desconocido"}`
    );
  }

  const salesOrderId = salesOrder.id;

  try {
    for (const item of quoteItems) {
      const extras = extrasByItemId[item.id] ?? [];
      const convertedItem =
        convertRate !== 1
          ? {
              ...item,
              unit_price: truncateMoney(item.unit_price * convertRate),
              subtotal: truncateMoney(item.subtotal * convertRate),
            }
          : item;

      const newSalesOrderItemId = await insertSalesOrderItemWithExtras({
        supabase,
        organizationId: organization.id,
        salesOrderId,
        quoteItem: convertedItem,
        extras,
      });

      const itemTaxes = itemTaxesByQuoteItemId.get(item.id) ?? [];
      if (itemTaxes.length > 0) {
        const { error: itemTaxesError } = await supabase
          .from("sales_order_item_taxes")
          .insert(
            itemTaxes.map((tax) => ({
              organization_id: organization.id,
              sales_order_id: salesOrderId,
              sales_order_item_id: newSalesOrderItemId,
              product_id: tax.product_id,
              tax_id: tax.tax_id,
              name: tax.name,
              rate: tax.rate,
              base_amount: convertMoney(tax.base_amount),
              tax_amount: convertMoney(tax.tax_amount),
              tax_code_snapshot: tax.tax_code_snapshot,
              source: tax.source,
            }))
          );

        if (itemTaxesError) {
          throw new Error(
            `No se pudieron crear los impuestos del item: ${itemTaxesError.message}`
          );
        }
      }
    }

    const headerTaxes = quoteTaxes.filter(
      (tax): tax is QuoteTaxRow & { tax_id: string } => Boolean(tax.tax_id)
    );
    if (headerTaxes.length > 0) {
      const { error: headerTaxesError } = await supabase
        .from("sales_order_taxes")
        .insert(
          headerTaxes.map((tax) => ({
            organization_id: organization.id,
            sales_order_id: salesOrderId,
            tax_id: tax.tax_id,
            name: tax.name,
            rate: tax.rate,
            base_amount: convertMoney(tax.base_amount),
            tax_amount: convertMoney(tax.tax_amount),
            tax_code_snapshot: tax.tax_code_snapshot,
          }))
        );

      if (headerTaxesError) {
        throw new Error(
          `No se pudieron crear los impuestos: ${headerTaxesError.message}`
        );
      }
    }

    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        status: "CONVERTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId);

    if (updateError) {
      throw new Error(
        `No se pudo actualizar el estado del presupuesto: ${updateError.message}`
      );
    }

    return salesOrderId;
  } catch (error) {
    await rollbackSalesOrder(supabase, salesOrderId);
    throw error;
  }
}

async function findCustomerIdsBySearch(
  supabase: SupabaseClient,
  orgId: string,
  search: string
): Promise<string[]> {
  const { data: matchingCustomers } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", orgId)
    .or(`fantasy_name.ilike.%${search}%,business_name.ilike.%${search}%`);

  return (matchingCustomers ?? []).map((c) => c.id);
}

const ALLOWED_QUOTE_SORT_COLUMNS = [
  "created_at",
  "status",
  "total_amount",
  "customer",
];

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: borderline function, refactor in follow-up
export async function getQuotesPaginated(
  orgSlug: string,
  params: QuotePaginationParams
): Promise<PaginatedResult<QuoteWithCustomer>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const sort = (params.sort ?? []).filter((s) =>
    ALLOWED_QUOTE_SORT_COLUMNS.includes(s.id)
  );

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const supabase = await createServerClient();
  const accessContext = await resolveQuotesAccessContext(supabase, orgSlug);

  let query = supabase
    .from("quotes")
    .select(
      "*, customers (id, business_name, fantasy_name, phone, email), quote_items (quantity)",
      { count: "exact" }
    )
    .eq("organization_id", org.id)
    .is("parent_quote_id", null);

  if (accessContext.scope === "own") {
    if (!accessContext.userId) {
      return { data: [], totalCount: 0, page, pageSize };
    }
    query = query.eq("created_by", accessContext.userId);
  }

  if (params.status && params.status !== "ALL") {
    query = query.eq("status", params.status as QuoteStatus);
  }

  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  }

  if (params.search) {
    const customerIds = await findCustomerIdsBySearch(
      supabase,
      org.id,
      params.search
    );

    if (customerIds.length === 0) {
      return {
        data: [],
        totalCount: 0,
        page,
        pageSize,
      };
    }

    query = query.in("customer_id", customerIds);
  }

  if (sort && sort.length > 0) {
    for (const s of sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching quotes:", error.message);
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  return {
    data: (data ?? []) as QuoteWithCustomer[],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getQuotesMetrics(orgSlug: string): Promise<QuoteMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      totalQuotes: 0,
      draftCount: 0,
      sentCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      convertedQuotes: 0,
      cancelledQuotes: 0,
    };
  }

  const supabase = await createServerClient();
  const accessContext = await resolveQuotesAccessContext(supabase, orgSlug);

  if (accessContext.scope === "own" && !accessContext.userId) {
    return {
      totalQuotes: 0,
      draftCount: 0,
      sentCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      convertedQuotes: 0,
      cancelledQuotes: 0,
    };
  }

  const baseQuery = (status?: string) => {
    let q = supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .is("parent_quote_id", null);
    if (accessContext.scope === "own" && accessContext.userId) {
      q = q.eq("created_by", accessContext.userId);
    }
    if (status) {
      q = q.eq("status", status as QuoteStatus);
    }
    return q;
  };

  const [
    { count: total },
    { count: draft },
    { count: sent },
    { count: approved },
    { count: rejected },
    { count: converted },
    { count: cancelled },
  ] = await Promise.all([
    baseQuery(),
    baseQuery("DRAFT"),
    baseQuery("SENT"),
    baseQuery("APPROVED"),
    baseQuery("REJECTED"),
    baseQuery("CONVERTED"),
    baseQuery("CANCELLED"),
  ]);

  return {
    totalQuotes: total ?? 0,
    draftCount: draft ?? 0,
    sentCount: sent ?? 0,
    approvedCount: approved ?? 0,
    rejectedCount: rejected ?? 0,
    convertedQuotes: converted ?? 0,
    cancelledQuotes: cancelled ?? 0,
  };
}

export async function getAllQuotesForExport(
  orgSlug: string,
  filters?: { status?: string; customerId?: string }
): Promise<QuoteWithCustomer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const supabase = await createServerClient();
  const accessContext = await resolveQuotesAccessContext(supabase, orgSlug);

  if (accessContext.scope === "own" && !accessContext.userId) {
    return [];
  }

  let query = supabase
    .from("quotes")
    .select(
      "*, customers (id, business_name, fantasy_name, phone, email), quote_items (quantity)"
    )
    .eq("organization_id", org.id)
    .is("parent_quote_id", null)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  if (filters?.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status as QuoteStatus);
  }

  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching quotes for export:", error.message);
    return [];
  }

  return (data ?? []) as QuoteWithCustomer[];
}
