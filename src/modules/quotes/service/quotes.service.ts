import { truncateMoney } from "@/lib/decimal";
import { requireAuth } from "@/lib/supabase/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { toDateOnlyString } from "@/modules/sales/utils/date";
import type { Database } from "@/types/supabase";
import type { QuoteWithCustomer } from "../actions/get-quotes.action";
import type {
  CreateQuoteInput,
  PaginatedResult,
  QuoteMetrics,
  QuotePaginationParams,
  QuoteStatus,
  UpdateQuoteInput,
} from "../types";

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
      exchange_rate: input.exchangeRate ?? null,
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
      quote_item_id: quoteItem.id,
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
): Promise<{ payment_condition: string | null }> {
  const { data: existingQuote, error: fetchError } = await supabase
    .from("quotes")
    .select("id, status, organization_id, payment_condition")
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

  return { payment_condition: existingQuote.payment_condition };
}

type CurrentItem = {
  product_id: string | null;
  product_variant_id: string | null;
  quantity: number;
  unit_price: number;
};

async function fetchCurrentQuoteItems(
  supabase: SupabaseClient,
  quoteId: string
): Promise<CurrentItem[]> {
  const { data, error } = await supabase
    .from("quote_items")
    .select("product_id, product_variant_id, quantity, unit_price")
    .eq("quote_id", quoteId);

  if (error) {
    throw new Error(`Error al obtener items del presupuesto: ${error.message}`);
  }

  return data ?? [];
}

function itemsAreDifferent(
  oldItems: CurrentItem[],
  newItems: CreateQuoteInput["items"]
): boolean {
  const oldByKey = new Map(
    oldItems.map((i) => [
      `${i.product_id ?? ""}|${i.product_variant_id ?? ""}`,
      i,
    ])
  );

  const seenKeys = new Set<string>();

  for (const item of newItems) {
    for (const variant of item.variants) {
      const key = `${item.productId ?? ""}|${variant.productVariantId ?? ""}`;
      seenKeys.add(key);
      const old = oldByKey.get(key);
      if (!old) {
        return true;
      }
      if (variant.quantity !== old.quantity) {
        return true;
      }
      if (item.unitPrice !== old.unit_price) {
        return true;
      }
    }
  }

  return oldItems.some(
    (i) => !seenKeys.has(`${i.product_id ?? ""}|${i.product_variant_id ?? ""}`)
  );
}
async function createCancelledVersion(
  supabase: SupabaseClient,
  quoteId: string,
  context: {
    orgId: string;
    userId: string;
    newItems: CreateQuoteInput["items"];
  }
): Promise<void> {
  const currentItems = await fetchCurrentQuoteItems(supabase, quoteId);

  if (!itemsAreDifferent(currentItems, context.newItems)) {
    return;
  }

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
      currency: original.currency,
      exchange_rate: original.exchange_rate ?? null,
      payment_condition: original.payment_condition,
      observations: original.observations,
      purchase_order_file: original.purchase_order_file,
      design_file_url: original.design_file_url,
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
}

async function copyQuoteItems(
  supabase: SupabaseClient,
  sourceQuoteId: string,
  targetQuoteId: string
): Promise<void> {
  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("*, quote_item_extras(*)")
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
  }
}

function buildUpdatePayload(
  input: UpdateQuoteInput,
  existing: { payment_condition: string | null }
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
    updated_at: new Date().toISOString(),
  };
}

async function applyItemsUpdate(
  supabase: SupabaseClient,
  quoteId: string,
  context: { orgId: string; userId: string },
  input: UpdateQuoteInput
): Promise<number | undefined> {
  if (!input.items) {
    return;
  }

  await createCancelledVersion(supabase, quoteId, {
    orgId: context.orgId,
    userId: context.userId,
    newItems: input.items,
  });

  return calculateTotalAmount({
    orgSlug: input.orgSlug,
    customerId: input.customerId ?? "",
    currency: input.currency ?? "ARS",
    exchangeRate: input.exchangeRate ?? null,
    paymentCondition: input.paymentCondition ?? null,
    observations: input.observations ?? null,
    items: input.items,
  });
}

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

  const updateData = buildUpdatePayload(input, existing);

  const totalAmount = await applyItemsUpdate(
    supabase,
    quoteId,
    { orgId: organization.id, userId },
    input
  );

  if (totalAmount !== undefined) {
    updateData.total_amount = totalAmount;
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

  if (input.items) {
    await deleteQuoteItems(supabase, quoteId);
    await insertQuoteItemsAndExtras(supabase, quoteId, input.items);
  }
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

  const convertRate =
    quote.currency === "USD" && quote.exchange_rate ? quote.exchange_rate : 1;

  const totalAmount = truncateMoney(quote.total_amount * convertRate);
  const saleDate = toDateOnlyString(new Date());

  const { data: salesOrder, error: salesOrderError } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organization.id,
      customer_id: quote.customer_id,
      user_id: userId,
      sale_date: saleDate,
      invoice_type: "NOTA_DE_VENTA",
      currency: "ARS",
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
      const convertedItem =
        convertRate !== 1
          ? {
              ...item,
              unit_price: truncateMoney(item.unit_price * convertRate),
              subtotal: truncateMoney(item.subtotal * convertRate),
            }
          : item;

      await insertSalesOrderItemWithExtras({
        supabase,
        organizationId: organization.id,
        salesOrderId,
        quoteItem: convertedItem,
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

export async function getQuotesPaginated(
  orgSlug: string,
  params: QuotePaginationParams
): Promise<PaginatedResult<QuoteWithCustomer>> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const supabase = await createServerClient();

  let query = supabase
    .from("quotes")
    .select(
      "*, customers (id, business_name, fantasy_name, phone, email), quote_items (quantity)",
      { count: "exact" }
    )
    .eq("organization_id", org.id)
    .is("parent_quote_id", null);

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
        page: params.page,
        pageSize: params.pageSize,
      };
    }

    query = query.in("customer_id", customerIds);
  }

  if (params.sort && params.sort.length > 0) {
    for (const s of params.sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching quotes:", error.message);
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  return {
    data: (data ?? []) as QuoteWithCustomer[],
    totalCount: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
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

  const baseQuery = (status?: string) => {
    let q = supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .is("parent_quote_id", null);
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

  let query = supabase
    .from("quotes")
    .select(
      "*, customers (id, business_name, fantasy_name, phone, email), quote_items (quantity)"
    )
    .eq("organization_id", org.id)
    .is("parent_quote_id", null)
    .order("created_at", { ascending: false })
    .limit(10_000);

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
