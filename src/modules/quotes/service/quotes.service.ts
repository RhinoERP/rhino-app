import { truncateMoney } from "@/lib/decimal";
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { toDateOnlyString } from "@/modules/sales/utils/date";
import type { Database } from "@/types/supabase";
import type { CreateQuoteInput, QuoteStatus } from "../types";

type SupabaseClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

function calculateTotalAmount(input: CreateQuoteInput): number {
  return truncateMoney(
    input.items.reduce((sum, item) => {
      const extrasTotal = (item.extras || []).reduce(
        (acc, e) => acc + e.price,
        0
      );
      const itemVariantsSum = truncateMoney(
        (item.variants || []).reduce((acc, variant) => {
          const variantSubtotal = truncateMoney(
            variant.quantity * item.unitPrice
          );
          return (
            acc +
            truncateMoney(variantSubtotal + extrasTotal * variant.quantity)
          );
        }, 0)
      );
      return sum + itemVariantsSum;
    }, 0)
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

async function insertQuoteItemVariant(
  supabase: SupabaseClient,
  quoteId: string,
  item: CreateQuoteInput["items"][number],
  variant: CreateQuoteInput["items"][number]["variants"][number]
): Promise<string> {
  const subtotal = truncateMoney(variant.quantity * item.unitPrice);
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
      discount_percentage: item.discountPercentage ?? null,
      discount_amount: item.discountAmount ?? null,
      product_variant_id: variant.productVariantId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (itemError || !itemData?.id) {
    throw new Error(
      `No se pudo crear item del presupuesto: ${itemError?.message ?? "Error desconocido"}`
    );
  }

  return itemData.id;
}

async function insertQuoteItemsAndExtras(
  supabase: SupabaseClient,
  quoteId: string,
  items: CreateQuoteInput["items"]
): Promise<void> {
  for (const item of items) {
    for (const variant of item.variants || []) {
      const itemId = await insertQuoteItemVariant(
        supabase,
        quoteId,
        item,
        variant
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

  const totalAmount = calculateTotalAmount(input);

  const { data: quoteData, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      organization_id: organization.id,
      customer_id: input.customerId,
      status: "DRAFT",
      total_amount: totalAmount,
      currency: input.currency ?? "ARS",
      payment_condition: input.paymentCondition ?? null,
      observations: input.observations ?? null,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (quoteError || !quoteData?.id) {
    throw new Error(
      `No se pudo crear el presupuesto: ${quoteError?.message ?? "Error desconocido"}`
    );
  }

  await insertQuoteItemsAndExtras(supabase, quoteData.id, input.items);

  return quoteData.id;
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
): Promise<void> {
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
    })
    .select("id")
    .maybeSingle();

  if (newItemError || !newItem?.id) {
    throw new Error(
      `No se pudo crear el item de la nota de venta: ${newItemError?.message ?? "Error desconocido"}`
    );
  }

  if (extras.length === 0) {
    return;
  }

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

  const totalAmount = truncateMoney(quote.total_amount);
  const saleDate = toDateOnlyString(new Date());

  const { data: salesOrder, error: salesOrderError } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organization.id,
      customer_id: quote.customer_id,
      user_id: userId,
      sale_date: saleDate,
      invoice_type: "NOTA_DE_VENTA",
      currency: quote.currency,
      sub_total: totalAmount,
      total_amount: totalAmount,
      global_discount_percentage: 0,
      global_discount_amount: 0,
      status: initialStatus ?? "DRAFT",
      is_historical: false,
      observations: quote.observations,
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
      await insertSalesOrderItemWithExtras({
        supabase,
        organizationId: organization.id,
        salesOrderId,
        quoteItem: item,
        extras,
      });
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
