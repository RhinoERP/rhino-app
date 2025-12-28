import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CreatePreSaleOrderInput,
  PreSaleItemInput,
  SaleProduct,
} from "../types";
import { computeDueDate } from "../utils/date";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const defaultInvoiceType: Database["public"]["Enums"]["invoice_type"] =
  "NOTA_DE_VENTA";

type ProductWithPriceRow =
  Database["public"]["Views"]["products_with_price"]["Row"];

type ProductWithRelations = ProductWithPriceRow & {
  suppliers?: { name: string | null } | null;
  categories?: { name: string | null } | null;
};

function sanitizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getCurrentUserId(
  client: SupabaseServerClient
): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

function normalizeItems(items: PreSaleItemInput[]): PreSaleItemInput[] {
  return items
    .map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      basePrice: Number.isFinite(item.basePrice)
        ? item.basePrice
        : item.unitPrice,
      discountPercentage: Number.isFinite(item.discountPercentage)
        ? Math.min(Math.max(Number(item.discountPercentage), 0), 100)
        : null,
      discountAmount: Number.isFinite(item.discountAmount)
        ? Number(item.discountAmount)
        : null,
    }))
    .filter(
      (item) => item.productId && item.quantity > 0 && item.unitPrice >= 0
    );
}

async function fetchActiveProductsForOrg(
  supabase: SupabaseServerClient,
  orgId: string
): Promise<ProductWithRelations[]> {
  const { data, error } = await supabase
    .from("products_with_price")
    .select(
      "id, sku, name, brand, calculated_sale_price, organization_id, is_active, unit_of_measure, supplier_id, category_id, suppliers(name), categories(name)"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error obteniendo productos: ${error.message}`);
  }

  return (data ?? []).filter(
    (product) => product.id && product.name && product.sku
  ) as ProductWithRelations[];
}

async function fetchTracksStockUnitsMap(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
) {
  const { data, error } = await supabase
    .from("products")
    .select("id, tracks_stock_units")
    .eq("organization_id", orgId)
    .in("id", productIds);

  if (error) {
    throw new Error(
      `Error obteniendo configuraciones de unidades: ${error.message}`
    );
  }

  const tracksStockUnitsByProduct = new Map<string, boolean>();
  for (const product of data ?? []) {
    if (product.id) {
      tracksStockUnitsByProduct.set(
        product.id,
        Boolean(product.tracks_stock_units)
      );
    }
  }

  return tracksStockUnitsByProduct;
}

async function fetchStockTotals(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
) {
  const { data, error } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available, unit_quantity_available")
    .eq("organization_id", orgId)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Error obteniendo stock: ${error.message}`);
  }

  const stockTotals = new Map<
    string,
    { totalQuantity: number; totalUnits: number | null }
  >();

  for (const lot of data ?? []) {
    if (!lot.product_id) {
      continue;
    }

    const current = stockTotals.get(lot.product_id) ?? {
      totalQuantity: 0,
      totalUnits: null as number | null,
    };

    const nextTotalUnits =
      current.totalUnits !== null || lot.unit_quantity_available !== null
        ? (current.totalUnits ?? 0) + (lot.unit_quantity_available ?? 0)
        : null;

    stockTotals.set(lot.product_id, {
      totalQuantity: current.totalQuantity + (lot.quantity_available ?? 0),
      totalUnits: nextTotalUnits,
    });
  }

  return stockTotals;
}

function computeAverageQuantityPerUnit(
  unitOfMeasure: SaleProduct["unitOfMeasure"],
  tracksStockUnits: boolean,
  totalUnits: number | null,
  totalQuantity: number | null
): number | null {
  const isWeightOrVolume = unitOfMeasure === "KG" || unitOfMeasure === "LT";

  if (!(tracksStockUnits && isWeightOrVolume)) {
    return null;
  }

  if (!totalUnits || totalUnits <= 0) {
    return null;
  }

  return (totalQuantity ?? 0) / totalUnits;
}

export async function getSaleProducts(orgSlug: string): Promise<SaleProduct[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const products = await fetchActiveProductsForOrg(supabase, org.id);

  if (!products.length) {
    return [];
  }

  const productIds = products
    .map((product) => product.id)
    .filter((id): id is string => Boolean(id));

  const tracksStockUnitsByProduct = await fetchTracksStockUnitsMap(
    supabase,
    org.id,
    productIds
  );

  const stockTotals = await fetchStockTotals(supabase, org.id, productIds);

  return products.map((product) => {
    const productId = product.id as string;
    const totals = stockTotals.get(productId);
    const totalQuantity = totals?.totalQuantity ?? null;
    const totalUnits = totals?.totalUnits ?? null;

    const unitOfMeasure =
      (product.unit_of_measure as Database["public"]["Enums"]["unit_of_measure_type"]) ||
      "UN";
    const tracksStockUnits = tracksStockUnitsByProduct.get(productId) ?? false;
    const averageQuantityPerUnit = computeAverageQuantityPerUnit(
      unitOfMeasure,
      tracksStockUnits,
      totalUnits,
      totalQuantity
    );

    return {
      id: productId,
      name: product.name as string,
      sku: product.sku as string,
      brand: product.brand,
      supplierId: product.supplier_id,
      supplierName: product.suppliers?.name ?? null,
      categoryId: product.category_id,
      categoryName: product.categories?.name ?? null,
      price: product.calculated_sale_price ?? 0,
      unitOfMeasure,
      tracksStockUnits,
      totalQuantity,
      totalUnitQuantity: totalUnits,
      averageQuantityPerUnit,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: business logic involves several guarded steps
export async function createPreSaleOrder(
  input: CreatePreSaleOrderInput
): Promise<string> {
  const { orgSlug, customerId, sellerId, saleDate } = input;

  if (!customerId) {
    throw new Error("El cliente es requerido");
  }

  if (!saleDate) {
    throw new Error("La fecha de venta es requerida");
  }

  const items = normalizeItems(input.items);

  if (!items.length) {
    throw new Error("Agrega al menos un producto a la preventa");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  const resolvedSellerId = sellerId || userId;

  if (!resolvedSellerId) {
    throw new Error("El vendedor es requerido");
  }

  const subTotalAmount = items.reduce((total, item) => {
    const gross = item.quantity * item.unitPrice;
    const discountAmountFromPercent =
      item.discountPercentage !== null && item.discountPercentage !== undefined
        ? (item.discountPercentage / 100) * gross
        : 0;
    const discount = Math.min(
      Math.max(0, item.discountAmount ?? discountAmountFromPercent),
      Math.max(0, gross)
    );
    return total + Math.max(0, gross - discount);
  }, 0);

  const taxAmounts = (input.taxes ?? []).map((tax) => ({
    taxId: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    baseAmount: subTotalAmount,
    taxAmount: subTotalAmount * (tax.rate / 100),
  }));

  const totalTaxAmount = taxAmounts.reduce(
    (total, tax) => total + tax.taxAmount,
    0
  );
  const preDiscountTotal = subTotalAmount + totalTaxAmount;

  const normalizedGlobalDiscountPercent =
    input.globalDiscountPercentage !== null &&
    input.globalDiscountPercentage !== undefined
      ? Math.min(Math.max(Number(input.globalDiscountPercentage), 0), 100)
      : null;

  const computedGlobalDiscountAmount =
    normalizedGlobalDiscountPercent !== null
      ? (normalizedGlobalDiscountPercent / 100) * preDiscountTotal
      : null;

  const providedGlobalDiscountAmount = Number.isFinite(
    input.globalDiscountAmount
  )
    ? Number(input.globalDiscountAmount)
    : null;

  const globalDiscountAmount = Math.min(
    Math.max(
      0,
      computedGlobalDiscountAmount ?? providedGlobalDiscountAmount ?? 0
    ),
    Math.max(0, preDiscountTotal)
  );

  const totalAmount = Math.max(0, preDiscountTotal - globalDiscountAmount);

  const dueDate = computeDueDate(
    saleDate,
    input.expirationDate,
    input.creditDays
  );

  const invoiceType = input.invoiceType || defaultInvoiceType;

  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: org.id,
      customer_id: customerId,
      user_id: resolvedSellerId as string,
      sale_date: saleDate,
      credit_days: input.creditDays ?? null,
      expiration_date: dueDate,
      invoice_type: invoiceType,
      invoice_number: sanitizeText(input.invoiceNumber),
      observations: sanitizeText(input.observations),
      sub_total: subTotalAmount,
      total_tax_amount: taxAmounts.length ? totalTaxAmount : null,
      global_discount_percentage: normalizedGlobalDiscountPercent ?? 0,
      global_discount_amount: globalDiscountAmount,
      total_amount: totalAmount,
      status: "DRAFT" satisfies Database["public"]["Enums"]["order_status"],
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (orderError) {
    throw new Error(`No se pudo crear la preventa: ${orderError.message}`);
  }

  if (!order?.id) {
    throw new Error("No se pudo obtener el ID de la preventa creada");
  }

  const saleOrderId = order.id;

  const itemsPayload = items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const discountAmountFromPercent =
      item.discountPercentage !== null && item.discountPercentage !== undefined
        ? (item.discountPercentage / 100) * gross
        : 0;
    const discount = Math.min(
      Math.max(0, item.discountAmount ?? discountAmountFromPercent),
      Math.max(0, gross)
    );
    const subtotal = Math.max(0, gross - discount);

    return {
      organization_id: org.id,
      sales_order_id: saleOrderId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      base_price: item.basePrice ?? item.unitPrice,
      discount_amount: discount,
      discount_percentage: item.discountPercentage ?? 0,
      subtotal,
    };
  });

  const { error: itemsError } = await supabase
    .from("sales_order_items")
    .insert(itemsPayload);

  if (itemsError) {
    await supabase.from("sales_orders").delete().eq("id", saleOrderId);
    throw new Error(
      `No se pudieron guardar los productos de la preventa: ${itemsError.message}`
    );
  }

  if (taxAmounts.length > 0) {
    const taxesPayload = taxAmounts.map((tax) => ({
      organization_id: org.id,
      sales_order_id: saleOrderId,
      tax_id: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.baseAmount,
      tax_amount: tax.taxAmount,
    }));

    const { error: taxesError } = await supabase
      .from("sales_order_taxes")
      .insert(taxesPayload);

    if (taxesError) {
      await supabase
        .from("sales_order_items")
        .delete()
        .eq("sales_order_id", saleOrderId);
      await supabase.from("sales_orders").delete().eq("id", saleOrderId);

      throw new Error(
        `No se pudieron guardar los impuestos de la preventa: ${taxesError.message}`
      );
    }
  }

  const { error: receivableError } = await supabase
    .from("accounts_receivable")
    .insert({
      organization_id: org.id,
      customer_id: customerId,
      sales_order_id: saleOrderId,
      total_amount: totalAmount,
      pending_balance: totalAmount,
      due_date: dueDate,
      status:
        "PENDING" satisfies Database["public"]["Enums"]["receivable_status"],
    });

  if (receivableError) {
    console.error("Error creating accounts receivable for pre-sale", {
      saleOrderId,
      error: receivableError,
    });
  }

  return saleOrderId;
}
