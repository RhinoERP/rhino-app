import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  ConfirmSaleItemInput,
  ConfirmSaleOrderInput,
  CreatePreSaleOrderInput,
  DeliverSaleOrderInput,
  DispatchSaleOrderInput,
  PreSaleItemInput,
  SaleProduct,
  SalesOrderStatus,
} from "../types";
import { computeDueDate } from "../utils/date";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const defaultInvoiceType: Database["public"]["Enums"]["invoice_type"] =
  "NOTA_DE_VENTA";

// Explicitly add remittance_number because generated types might be outdated
export type SalesOrder = Database["public"]["Tables"]["sales_orders"]["Row"] & {
  remittance_number?: string | null;
};

export type SalesSeller = {
  id: string;
  name?: string;
  email?: string;
};

export type SalesOrderWithCustomer = SalesOrder & {
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
  };
  seller: SalesSeller | null;
};

type SalesOrderWithCustomerRaw = SalesOrder & {
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
      }>
    | null;
};

type SalesOrderItemRaw =
  Database["public"]["Tables"]["sales_order_items"]["Row"] & {
    unit_quantity?: number | null;
    base_price?: number | null;
    discount_amount?: number | null;
    discount_percentage?: number | null;
    subtotal?: number | null;
    product?: {
      id?: string | null;
      name?: string | null;
      sku?: string | null;
      brand?: string | null;
      unit_of_measure?:
        | Database["public"]["Enums"]["unit_of_measure_type"]
        | null;
      tracks_stock_units?: boolean | null;
      weight_per_unit?: number | null;
    } | null;
  };

type SalesOrderWithRelations = SalesOrderWithCustomerRaw & {
  items?: SalesOrderItemRaw[] | null;
  taxes?: Array<{
    id?: string | null;
    tax_id?: string | null;
    name?: string | null;
    rate?: number | null;
    tax_amount?: number | null;
    base_amount?: number | null;
  }> | null;
  global_discount_percentage?: number | null;
  global_discount_amount?: number | null;
  invoice_number?: string | null;
  observations?: string | null;
  credit_days?: number | null;
};

export type SalesOrderTaxDetail = {
  id?: string;
  taxId: string;
  name: string;
  rate: number;
  taxAmount: number;
  baseAmount?: number | null;
};

export type SalesOrderItemDetail = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  brand?: string | null;
  quantity: number;
  weightQuantity: number | null;
  unitPrice: number;
  basePrice: number;
  discountPercent: number;
  subtotal: number;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  averageQuantityPerUnit: number | null;
};

export type SalesOrderDetail = SalesOrderWithCustomer & {
  invoice_number: string | null;
  credit_days: number | null;
  observations: string | null;
  global_discount_percentage: number | null;
  global_discount_amount: number | null;
  remittance_number: string | null;
  items: SalesOrderItemDetail[];
  taxes: SalesOrderTaxDetail[];
};

export type ConfirmSaleResult = {
  status: SalesOrderStatus;
  saleId: string;
  totalAmount: number;
};

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

function normalizeCustomerFromSale(
  sale: SalesOrderWithCustomerRaw
): SalesOrderWithCustomer["customer"] {
  const customer = Array.isArray(sale.customer)
    ? sale.customer[0]
    : sale.customer;

  const normalizedCustomer =
    customer && typeof customer === "object" && "id" in customer
      ? {
          id: (customer.id as string) ?? sale.customer_id,
          business_name:
            (customer.business_name as string | null) ?? "Cliente desconocido",
          fantasy_name: (customer.fantasy_name as string | null) ?? null,
        }
      : {
          id: sale.customer_id,
          business_name: "Cliente desconocido",
          fantasy_name: null,
        };

  return normalizedCustomer;
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

function normalizeConfirmItems(
  items: ConfirmSaleItemInput[]
): ConfirmSaleItemInput[] {
  return items
    .map((item) => ({
      ...item,
      quantity: Number.isFinite(item.quantity)
        ? Math.max(0, Number(item.quantity))
        : 0,
      weightQuantity:
        item.weightQuantity !== undefined && item.weightQuantity !== null
          ? Math.max(0, Number(item.weightQuantity))
          : null,
      unitPrice: Number(item.unitPrice),
      basePrice: Number.isFinite(item.basePrice)
        ? Number(item.basePrice)
        : item.unitPrice,
      discountPercentage:
        item.discountPercentage !== undefined &&
        item.discountPercentage !== null
          ? Math.min(Math.max(Number(item.discountPercentage), 0), 100)
          : 0,
    }))
    .filter(
      (item) =>
        item.productId &&
        item.unitPrice >= 0 &&
        (item.quantity > 0 || (item.weightQuantity ?? 0) > 0)
    );
}

function resolveCustomerDisplayNameFromRecord(
  customer?: {
    business_name?: string | null;
    fantasy_name?: string | null;
  } | null
): string | null {
  const fantasy = customer?.fantasy_name?.trim();
  if (fantasy) {
    return fantasy;
  }

  const business = customer?.business_name?.trim();
  if (business) {
    return business;
  }

  return null;
}

function formatSaleMovementReason(params: {
  saleNumber?: number | null;
  invoiceNumber?: string | null;
  saleId: string;
  customerName?: string | null;
  prefix?: string;
}): string {
  const { saleNumber, invoiceNumber, saleId, customerName, prefix } = params;

  const trimmedInvoice = invoiceNumber?.trim();
  let reference = `Venta ${saleId.slice(0, 6)}`;

  if (saleNumber !== null && saleNumber !== undefined) {
    reference = `Venta N${saleNumber}`;
  } else if (trimmedInvoice) {
    reference = `Venta ${trimmedInvoice}`;
  }

  const name = customerName?.trim();
  const reason = name ? `${reference} ${name}` : reference;

  return prefix ? `${prefix}${reason}` : reason;
}

function calculateConfirmItemTotals(item: ConfirmSaleItemInput) {
  const hasWeight =
    item.weightQuantity !== undefined &&
    item.weightQuantity !== null &&
    item.weightQuantity > 0;
  const effectiveQuantity = hasWeight
    ? (item.weightQuantity ?? 0)
    : item.quantity;
  const effectiveUnitPrice =
    hasWeight && Number.isFinite(item.basePrice)
      ? (item.basePrice as number)
      : item.unitPrice;
  const gross = effectiveQuantity * effectiveUnitPrice;
  const discountPercent = item.discountPercentage ?? 0;
  const discount = Math.min(
    Math.max(0, (discountPercent / 100) * gross),
    Math.max(0, gross)
  );
  const subtotal = Math.max(0, gross - discount);

  return { gross, discount, subtotal };
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

export async function getSalesOrdersByOrgSlug(
  orgSlug: string
): Promise<SalesOrderWithCustomer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const [salesResult, membersResult] = await Promise.all([
    supabase
      .from("sales_orders")
      .select(
        `
          *,
          customer:customers(id, business_name, fantasy_name)
        `
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_organization_members_with_users", {
      org_slug_param: orgSlug,
    }),
  ]);

  const { data, error } = salesResult;
  const { data: members, error: membersError } = membersResult;

  if (error) {
    throw new Error(`Error obteniendo ventas: ${error.message}`);
  }

  if (membersError) {
    throw new Error(`Error obteniendo vendedores: ${membersError.message}`);
  }

  if (!data) {
    return [];
  }

  const sellersByUserId = new Map<string, SalesSeller>();
  for (const member of members ?? []) {
    if (!member.user_id) {
      continue;
    }

    sellersByUserId.set(member.user_id, {
      id: member.user_id,
      name: member.full_name ?? undefined,
      email: member.email ?? undefined,
    });
  }

  return data.map((order: SalesOrderWithCustomerRaw) => {
    const normalizedCustomer = normalizeCustomerFromSale(order);

    return {
      ...order,
      customer: normalizedCustomer,
      seller: sellersByUserId.get(order.user_id) ?? null,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching requires several guarded branches
export async function getSalesOrderById(
  orgSlug: string,
  saleId: string
): Promise<SalesOrderDetail | null> {
  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const [saleResult, membersResult] = await Promise.all([
    supabase
      .from("sales_orders")
      .select(
        `
          *,
          customer:customers(id, business_name, fantasy_name),
          items:sales_order_items(
            id,
            product_id,
            quantity,
            unit_quantity,
            unit_price,
            base_price,
            discount_amount,
            discount_percentage,
            subtotal,
            product:products(
              id,
              name,
              sku,
              brand,
              unit_of_measure,
              tracks_stock_units,
              weight_per_unit
            )
          ),
          taxes:sales_order_taxes(
            id,
            tax_id,
            name,
            rate,
            tax_amount,
            base_amount
          )
        `
      )
      .eq("organization_id", org.id)
      .eq("id", saleId)
      .maybeSingle(),
    supabase.rpc("get_organization_members_with_users", {
      org_slug_param: orgSlug,
    }),
  ]);

  const { data, error } = saleResult;
  const { data: members, error: membersError } = membersResult;

  if (error) {
    throw new Error(`Error obteniendo la venta: ${error.message}`);
  }

  if (membersError) {
    throw new Error(`Error obteniendo vendedores: ${membersError.message}`);
  }

  if (!data) {
    return null;
  }

  const sale = data as unknown as SalesOrderWithRelations;
  const productIds = (sale.items ?? [])
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));

  const sellersByUserId = new Map<string, SalesSeller>();
  for (const member of members ?? []) {
    if (!member.user_id) {
      continue;
    }

    sellersByUserId.set(member.user_id, {
      id: member.user_id,
      name: member.full_name ?? undefined,
      email: member.email ?? undefined,
    });
  }

  const tracksStockUnitsByProduct = productIds.length
    ? await fetchTracksStockUnitsMap(supabase, org.id, productIds)
    : new Map<string, boolean>();

  const stockTotals = productIds.length
    ? await fetchStockTotals(supabase, org.id, productIds)
    : new Map<string, { totalQuantity: number; totalUnits: number | null }>();

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mapping normalizes multiple optional fields
  const items: SalesOrderItemDetail[] = (sale.items ?? []).map((item) => {
    const product = item.product ?? {};
    const productId = item.product_id;
    const unitOfMeasure =
      (product.unit_of_measure as SaleProduct["unitOfMeasure"]) || "UN";
    const isWeightUnit =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";
    const rawWeight = isWeightUnit ? (item.unit_quantity ?? null) : null;
    const totals = productId ? stockTotals.get(productId) : undefined;
    const totalQuantity = totals?.totalQuantity ?? null;
    const totalUnits = totals?.totalUnits ?? null;
    const tracksStockUnits =
      tracksStockUnitsByProduct.get(productId) ??
      Boolean(product.tracks_stock_units);
    const averageQuantityPerUnit = computeAverageQuantityPerUnit(
      unitOfMeasure,
      tracksStockUnits,
      totalUnits,
      totalQuantity
    );

    const weightQuantity =
      rawWeight ??
      (averageQuantityPerUnit && item.quantity
        ? averageQuantityPerUnit * item.quantity
        : null);

    return {
      id: item.id,
      productId: item.product_id,
      name: product.name ?? "Producto sin nombre",
      sku: product.sku ?? "",
      brand: product.brand ?? null,
      quantity: item.quantity ?? 0,
      weightQuantity,
      unitPrice: item.unit_price ?? 0,
      basePrice: item.base_price ?? item.unit_price ?? 0,
      discountPercent: item.discount_percentage ?? 0,
      subtotal: item.subtotal ?? 0,
      unitOfMeasure,
      tracksStockUnits,
      averageQuantityPerUnit:
        averageQuantityPerUnit && Number.isFinite(averageQuantityPerUnit)
          ? averageQuantityPerUnit
          : null,
    };
  });

  const taxes: SalesOrderTaxDetail[] = (sale.taxes ?? [])
    .filter((tax) => tax?.tax_id)
    .map((tax) => ({
      id: tax?.id ?? undefined,
      taxId: (tax?.tax_id as string) ?? "",
      name: tax?.name ?? "",
      rate: tax?.rate ?? 0,
      taxAmount: tax?.tax_amount ?? 0,
      baseAmount: tax?.base_amount ?? null,
    }));

  const seller = sale.user_id
    ? (sellersByUserId.get(sale.user_id) ?? null)
    : null;

  const saleBase: SalesOrderWithCustomer = {
    ...(sale as SalesOrder),
    customer: normalizeCustomerFromSale(sale),
    seller,
  };

  return {
    ...saleBase,
    invoice_number: sale.invoice_number ?? null,
    credit_days: sale.credit_days ?? null,
    observations: sale.observations ?? null,
    global_discount_percentage: sale.global_discount_percentage ?? 0,
    global_discount_amount: sale.global_discount_amount ?? 0,
    remittance_number: sale.remittance_number ?? null,
    items,
    taxes,
  };
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

  const normalizedGlobalDiscountPercent =
    input.globalDiscountPercentage !== null &&
    input.globalDiscountPercentage !== undefined
      ? Math.min(Math.max(Number(input.globalDiscountPercentage), 0), 100)
      : null;

  const computedGlobalDiscountAmount =
    normalizedGlobalDiscountPercent !== null
      ? (normalizedGlobalDiscountPercent / 100) * subTotalAmount
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
    Math.max(0, subTotalAmount)
  );

  const discountedSubtotal = Math.max(0, subTotalAmount - globalDiscountAmount);

  const taxAmounts = (input.taxes ?? []).map((tax) => ({
    taxId: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    baseAmount: discountedSubtotal,
    taxAmount: discountedSubtotal * (tax.rate / 100),
  }));

  const totalTaxAmount = taxAmounts.reduce(
    (total, tax) => total + tax.taxAmount,
    0
  );

  const totalAmount = Math.max(0, discountedSubtotal + totalTaxAmount);

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

type ProductStockMetadata = {
  id: string;
  name: string;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
};

type StockAdjustmentContext = {
  lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][];
};

const isWeightOrVolumeUnit = (unit: SaleProduct["unitOfMeasure"]) =>
  unit === "KG" || unit === "LT";

function compareLotsForFifo(
  a: {
    expiration_date?: string | null;
    created_at?: string | null;
    lot_number?: string | null;
    id?: string | null;
  },
  b: {
    expiration_date?: string | null;
    created_at?: string | null;
    lot_number?: string | null;
    id?: string | null;
  }
) {
  const expirationA = a.expiration_date ? new Date(a.expiration_date) : null;
  const expirationB = b.expiration_date ? new Date(b.expiration_date) : null;

  const expirationDiff =
    (expirationA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (expirationB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (expirationDiff !== 0) {
    return expirationDiff;
  }

  const createdA = a.created_at ? new Date(a.created_at) : null;
  const createdB = b.created_at ? new Date(b.created_at) : null;
  const createdDiff =
    (createdA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (createdB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (createdDiff !== 0) {
    return createdDiff;
  }

  const lotNumberA = a.lot_number ?? "";
  const lotNumberB = b.lot_number ?? "";

  if (lotNumberA !== lotNumberB) {
    return lotNumberA.localeCompare(lotNumberB);
  }

  return (a.id ?? "").localeCompare(b.id ?? "");
}

function resolveWeightRequirement(
  item: ConfirmSaleItemInput,
  product: ProductStockMetadata,
  totals: { totalQuantity: number; totalUnits: number | null }
) {
  const explicitWeight =
    item.weightQuantity !== undefined && item.weightQuantity !== null
      ? Math.max(0, Number(item.weightQuantity))
      : 0;

  if (explicitWeight > 0) {
    return explicitWeight;
  }

  const averageQuantityPerUnit = computeAverageQuantityPerUnit(
    product.unitOfMeasure,
    product.tracksStockUnits,
    totals.totalUnits,
    totals.totalQuantity
  );

  if (averageQuantityPerUnit && item.quantity > 0) {
    return averageQuantityPerUnit * item.quantity;
  }

  return Math.max(0, item.quantity);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stock allocation across lots requires several guarded branches
async function buildStockAdjustmentContext(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: ConfirmSaleItemInput[];
  movementReason: string;
}): Promise<StockAdjustmentContext> {
  const { supabase, orgId, items, movementReason } = params;

  const productIds = Array.from(
    new Set(items.map((item) => item.productId).filter(Boolean))
  );

  if (!productIds.length) {
    return {
      lotUpdates: [],
      rollbackLotUpdates: [],
      movementPayloads: [],
    };
  }

  const [productsResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit_of_measure, tracks_stock_units")
      .eq("organization_id", orgId)
      .in("id", productIds),
    supabase
      .from("product_lots")
      .select(
        "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date, created_at"
      )
      .eq("organization_id", orgId)
      .in("product_id", productIds)
      .order("expiration_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(
      `Error validando productos de la venta: ${productsResult.error.message}`
    );
  }

  if (lotsResult.error) {
    throw new Error(
      `Error obteniendo lotes para descontar stock: ${lotsResult.error.message}`
    );
  }

  const products =
    (productsResult.data as Array<{
      id?: string | null;
      name?: string | null;
      unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"];
      tracks_stock_units?: boolean | null;
    }>) ?? [];

  const lots =
    (lotsResult.data as Array<{
      id?: string | null;
      product_id?: string | null;
      quantity_available?: number | null;
      unit_quantity_available?: number | null;
      lot_number?: string | null;
      expiration_date?: string | null;
      created_at?: string | null;
    }>) ?? [];

  const productsById = new Map<string, ProductStockMetadata>();

  for (const product of products) {
    if (!product.id) {
      continue;
    }

    productsById.set(product.id, {
      id: product.id,
      name: product.name ?? "Producto sin nombre",
      unitOfMeasure:
        (product.unit_of_measure as SaleProduct["unitOfMeasure"]) || "UN",
      tracksStockUnits: Boolean(product.tracks_stock_units),
    });
  }

  for (const productId of productIds) {
    if (!productsById.has(productId)) {
      throw new Error("No se encontró uno de los productos de la venta.");
    }
  }

  const lotsByProduct = new Map<string, typeof lots>();
  const totalsByProduct = new Map<
    string,
    { totalQuantity: number; totalUnits: number | null }
  >();

  for (const lot of lots) {
    if (!lot.product_id) {
      continue;
    }

    const lotList = lotsByProduct.get(lot.product_id) ?? [];
    lotList.push(lot);
    lotsByProduct.set(lot.product_id, lotList);

    const currentTotals = totalsByProduct.get(lot.product_id) ?? {
      totalQuantity: 0,
      totalUnits: null as number | null,
    };

    const nextTotalUnits =
      currentTotals.totalUnits !== null || lot.unit_quantity_available !== null
        ? (currentTotals.totalUnits ?? 0) + (lot.unit_quantity_available ?? 0)
        : null;

    totalsByProduct.set(lot.product_id, {
      totalQuantity:
        currentTotals.totalQuantity + (lot.quantity_available ?? 0),
      totalUnits: nextTotalUnits,
    });
  }

  const lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][] =
    [];
  const rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Update"][] =
    [];
  const movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][] =
    [];
  const rollbackSnapshotByLot = new Set<string>();
  const timestamp = new Date().toISOString();

  for (const item of items) {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error("Producto no encontrado para descontar stock.");
    }

    const productLots = [...(lotsByProduct.get(item.productId) ?? [])].sort(
      compareLotsForFifo
    );
    const totals = totalsByProduct.get(item.productId) ?? {
      totalQuantity: 0,
      totalUnits: null as number | null,
    };

    if (!productLots.length || totals.totalQuantity <= 0) {
      throw new Error(`No hay stock disponible para ${product.name}.`);
    }

    const weightUnit = isWeightOrVolumeUnit(product.unitOfMeasure);
    const requiredBase = weightUnit
      ? resolveWeightRequirement(item, product, totals)
      : item.quantity;
    const requiredUnits =
      weightUnit && product.tracksStockUnits ? item.quantity : null;

    if (requiredBase > totals.totalQuantity) {
      throw new Error(
        `No hay stock suficiente para ${product.name}. Disponible: ${totals.totalQuantity}`
      );
    }

    if (
      requiredUnits !== null &&
      totals.totalUnits !== null &&
      requiredUnits > totals.totalUnits
    ) {
      throw new Error(
        `No hay unidades suficientes para ${product.name}. Disponibles: ${totals.totalUnits}`
      );
    }

    let remainingBase = requiredBase;
    let remainingUnits = requiredUnits ?? 0;

    for (const lot of productLots) {
      if (remainingBase <= 0 && remainingUnits <= 0) {
        break;
      }

      const lotId = lot.id;
      const lotProductId = lot.product_id;
      const lotNumber = lot.lot_number;
      const expirationDate = lot.expiration_date;

      if (!(lotId && lotNumber && lotProductId && expirationDate)) {
        continue;
      }

      const availableQuantity = Math.max(0, lot.quantity_available ?? 0);
      const availableUnits =
        requiredUnits !== null && lot.unit_quantity_available !== null
          ? Math.max(0, lot.unit_quantity_available ?? 0)
          : 0;

      if (availableQuantity <= 0 && availableUnits <= 0) {
        continue;
      }

      const baseToConsume =
        remainingBase > 0 ? Math.min(availableQuantity, remainingBase) : 0;
      const unitsToConsume =
        requiredUnits !== null && remainingUnits > 0
          ? Math.min(availableUnits, remainingUnits)
          : 0;

      if (baseToConsume <= 0 && unitsToConsume <= 0) {
        continue;
      }

      if (!rollbackSnapshotByLot.has(lotId)) {
        rollbackSnapshotByLot.add(lotId);
        rollbackLotUpdates.push({
          id: lotId,
          organization_id: orgId,
          product_id: lotProductId as string,
          lot_number: lotNumber,
          expiration_date: expirationDate as string,
          quantity_available: availableQuantity,
          ...(lot.unit_quantity_available !== null
            ? { unit_quantity_available: lot.unit_quantity_available }
            : {}),
          updated_at: timestamp,
        });
      }

      const nextQuantity = Math.max(0, availableQuantity - baseToConsume);
      const nextUnits =
        requiredUnits !== null && lot.unit_quantity_available !== null
          ? Math.max(0, (lot.unit_quantity_available ?? 0) - unitsToConsume)
          : null;

      lotUpdates.push({
        id: lotId,
        organization_id: orgId,
        product_id: lotProductId as string,
        lot_number: lotNumber,
        expiration_date: expirationDate as string,
        quantity_available: nextQuantity,
        ...(nextUnits !== null ? { unit_quantity_available: nextUnits } : {}),
        updated_at: timestamp,
      });

      movementPayloads.push({
        organization_id: orgId,
        lot_id: lotId,
        type: "OUTBOUND",
        quantity: baseToConsume,
        previous_stock: availableQuantity,
        new_stock: nextQuantity,
        unit_quantity:
          requiredUnits !== null && unitsToConsume > 0 ? -unitsToConsume : null,
        reason: movementReason,
      });

      remainingBase -= baseToConsume;
      remainingUnits -= unitsToConsume;
    }

    if (remainingBase > 0 || remainingUnits > 0) {
      throw new Error(
        `No se pudo asignar stock suficiente para ${product.name}.`
      );
    }
  }

  return {
    lotUpdates,
    rollbackLotUpdates,
    movementPayloads,
  } as StockAdjustmentContext;
}

async function getSaleReasonMetadata(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<{
  saleNumber: number | null;
  invoiceNumber: string | null;
  customerName: string | null;
  reasonText: string;
  legacyReasonText: string;
}> {
  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      `
        sale_number,
        invoice_number,
        customer:customers(fantasy_name, business_name)
      `
    )
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("No se pudo obtener la referencia de la venta", {
      saleId,
      error,
    });
  }

  const customerName = resolveCustomerDisplayNameFromRecord(
    (
      data as {
        customer?: {
          fantasy_name?: string | null;
          business_name?: string | null;
        };
      }
    )?.customer ?? null
  );

  const saleNumber =
    (data as { sale_number?: number | null })?.sale_number ?? null;
  const invoiceNumber =
    (data as { invoice_number?: string | null })?.invoice_number ?? null;

  return {
    saleNumber,
    invoiceNumber,
    customerName,
    reasonText: formatSaleMovementReason({
      saleNumber,
      invoiceNumber,
      saleId,
      customerName,
    }),
    legacyReasonText: `Venta confirmada ${saleId}`,
  };
}

async function applyStockAdjustments(
  supabase: SupabaseServerClient,
  context: StockAdjustmentContext
) {
  if (!context.lotUpdates.length) {
    return [] as string[];
  }

  const { error: lotUpdateError } = await supabase
    .from("product_lots")
    .upsert(context.lotUpdates);

  if (lotUpdateError) {
    throw new Error(
      `No se pudo descontar el stock de los productos: ${lotUpdateError.message}`
    );
  }

  if (!context.movementPayloads.length) {
    return [] as string[];
  }

  const { data: movements, error: movementError } = await supabase
    .from("stock_movements")
    .insert(context.movementPayloads)
    .select("id");

  if (movementError) {
    await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    throw new Error(
      `No se pudo registrar el movimiento de stock: ${movementError.message}`
    );
  }

  return (movements ?? [])
    .map((movement) => movement.id)
    .filter((id): id is string => Boolean(id));
}

async function rollbackStockAdjustments(
  supabase: SupabaseServerClient,
  orgId: string,
  context: StockAdjustmentContext,
  movementIds: string[]
) {
  if (movementIds.length) {
    try {
      await supabase
        .from("stock_movements")
        .delete()
        .in("id", movementIds)
        .eq("organization_id", orgId);
    } catch (error) {
      console.error("No se pudieron revertir los movimientos de stock", error);
    }
  }

  if (context.rollbackLotUpdates.length) {
    try {
      await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    } catch (error) {
      console.error("No se pudo revertir el stock descontado", error);
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Restocking needs to traverse related movements and lots with validations
async function restockFromSale(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
) {
  const saleReason = await getSaleReasonMetadata(supabase, orgId, saleId);

  const { data: movements, error: movementsError } = await supabase
    .from("stock_movements")
    .select("id, lot_id, quantity, unit_quantity")
    .eq("organization_id", orgId)
    .in("reason", [saleReason.reasonText, saleReason.legacyReasonText]);

  if (movementsError) {
    throw new Error(
      `No se pudieron obtener los movimientos de la venta para reingresar stock: ${movementsError.message}`
    );
  }

  if (!movements?.length) {
    return;
  }

  const lotIds = movements
    .map((movement) => movement.lot_id)
    .filter((id): id is string => Boolean(id));

  if (!lotIds.length) {
    return;
  }

  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date"
    )
    .eq("organization_id", orgId)
    .in("id", lotIds);

  if (lotsError) {
    throw new Error(
      `No se pudieron obtener los lotes para reingresar stock: ${lotsError.message}`
    );
  }

  const lotsById = new Map<
    string,
    {
      product_id: string | null;
      lot_number: string | null;
      expiration_date: string | null;
      quantity_available: number | null;
      unit_quantity_available: number | null;
    }
  >();

  for (const lot of lots ?? []) {
    if (!lot.id) {
      continue;
    }
    lotsById.set(lot.id, {
      product_id: lot.product_id ?? null,
      lot_number: lot.lot_number ?? null,
      expiration_date: lot.expiration_date ?? null,
      quantity_available: lot.quantity_available,
      unit_quantity_available: lot.unit_quantity_available,
    });
  }

  const lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][] =
    [];
  const movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][] =
    [];

  const timestamp = new Date().toISOString();

  for (const movement of movements) {
    if (!movement.lot_id) {
      continue;
    }

    const lotState = lotsById.get(movement.lot_id);
    const previousStock = lotState?.quantity_available ?? 0;
    const previousUnitStock = lotState?.unit_quantity_available ?? null;
    const productId = lotState?.product_id;
    const lotNumber = lotState?.lot_number;
    const expirationDate = lotState?.expiration_date;

    if (!(productId && lotNumber && expirationDate)) {
      continue;
    }

    const newStock = previousStock + (movement.quantity ?? 0);
    const restoredUnitQuantity =
      movement.unit_quantity !== null &&
      movement.unit_quantity !== undefined &&
      previousUnitStock !== null
        ? previousUnitStock + Math.abs(movement.unit_quantity)
        : previousUnitStock;

    lotUpdates.push({
      id: movement.lot_id,
      organization_id: orgId,
      product_id: productId,
      lot_number: lotNumber,
      expiration_date: expirationDate,
      quantity_available: newStock,
      ...(restoredUnitQuantity !== null
        ? { unit_quantity_available: restoredUnitQuantity }
        : {}),
      updated_at: timestamp,
    });

    movementPayloads.push({
      organization_id: orgId,
      lot_id: movement.lot_id,
      type: "INBOUND",
      quantity: Math.abs(movement.quantity ?? 0),
      previous_stock: previousStock,
      new_stock: newStock,
      unit_quantity:
        movement.unit_quantity !== null && movement.unit_quantity !== undefined
          ? Math.abs(movement.unit_quantity)
          : null,
      reason: formatSaleMovementReason({
        saleNumber: saleReason.saleNumber,
        invoiceNumber: saleReason.invoiceNumber,
        saleId,
        customerName: saleReason.customerName,
        prefix: "Reingreso ",
      }),
    });
  }

  if (lotUpdates.length) {
    const { error: updateError } = await supabase
      .from("product_lots")
      .upsert(lotUpdates);

    if (updateError) {
      throw new Error(
        `No se pudo reingresar el stock de la venta: ${updateError.message}`
      );
    }
  }

  if (movementPayloads.length) {
    const { error: movementInsertError } = await supabase
      .from("stock_movements")
      .insert(movementPayloads);

    if (movementInsertError) {
      throw new Error(
        `No se pudo registrar el reingreso de stock: ${movementInsertError.message}`
      );
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: confirmation flow validates and persists several related records
export async function confirmSaleOrder(
  input: ConfirmSaleOrderInput
): Promise<ConfirmSaleResult> {
  const { orgSlug, saleId, customerId, sellerId, saleDate } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  if (!customerId) {
    throw new Error("El cliente es requerido");
  }

  if (!saleDate) {
    throw new Error("La fecha de venta es requerida");
  }

  const items = normalizeConfirmItems(input.items);

  if (!items.length) {
    throw new Error("Agrega al menos un producto para confirmar la venta");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: existingSale, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, credit_days, invoice_type, expiration_date, sale_number, invoice_number"
    )
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para confirmar: ${saleError.message}`
    );
  }

  if (!existingSale) {
    throw new Error("Venta no encontrada");
  }

  const currentStatus = existingSale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede confirmar una venta cancelada");
  }

  if (!sellerId) {
    throw new Error("El vendedor es requerido");
  }

  const { data: saleCustomer, error: customerError } = await supabase
    .from("customers")
    .select("business_name, fantasy_name")
    .eq("id", customerId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (customerError) {
    console.error(
      "No se pudo obtener el cliente para el motivo de stock de la venta",
      customerError
    );
  }

  const saleMovementReason = formatSaleMovementReason({
    saleNumber: existingSale.sale_number,
    invoiceNumber: input.invoiceNumber ?? existingSale.invoice_number,
    saleId,
    customerName: resolveCustomerDisplayNameFromRecord(saleCustomer ?? null),
  });

  const shouldUpdateStock = currentStatus === "DRAFT";
  const stockAdjustmentContext = shouldUpdateStock
    ? await buildStockAdjustmentContext({
        supabase,
        orgId: org.id,
        items,
        movementReason: saleMovementReason,
      })
    : null;

  let appliedMovementIds: string[] = [];

  if (stockAdjustmentContext?.lotUpdates.length) {
    appliedMovementIds = await applyStockAdjustments(
      supabase,
      stockAdjustmentContext
    );
  }

  try {
    const invoiceType =
      input.invoiceType ||
      (existingSale.invoice_type as Database["public"]["Enums"]["invoice_type"]) ||
      defaultInvoiceType;

    const creditDays = input.creditDays ?? existingSale.credit_days ?? null;
    const dueDate = computeDueDate(
      saleDate,
      input.expirationDate ?? existingSale.expiration_date ?? null,
      creditDays
    );

    const subTotalAmount = items.reduce((total, item) => {
      const { subtotal } = calculateConfirmItemTotals(item);
      return total + subtotal;
    }, 0);

    const normalizedGlobalDiscountPercent =
      input.globalDiscountPercentage !== null &&
      input.globalDiscountPercentage !== undefined
        ? Math.min(Math.max(Number(input.globalDiscountPercentage), 0), 100)
        : null;

    const computedGlobalDiscountAmount =
      normalizedGlobalDiscountPercent !== null
        ? (normalizedGlobalDiscountPercent / 100) * subTotalAmount
        : null;

    const globalDiscountAmount = Math.min(
      Math.max(0, computedGlobalDiscountAmount ?? 0),
      Math.max(0, subTotalAmount)
    );

    const discountedSubtotal = Math.max(
      0,
      subTotalAmount - globalDiscountAmount
    );

    const taxAmounts = (input.taxes ?? []).map((tax) => ({
      taxId: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      baseAmount: discountedSubtotal,
      taxAmount: discountedSubtotal * (tax.rate / 100),
    }));

    const totalTaxAmount = taxAmounts.reduce(
      (total, tax) => total + tax.taxAmount,
      0
    );

    const totalAmount = Math.max(0, discountedSubtotal + totalTaxAmount);

    const { error: updateSaleError } = await supabase
      .from("sales_orders")
      .update({
        customer_id: customerId,
        user_id: sellerId,
        sale_date: saleDate,
        credit_days: creditDays,
        expiration_date: dueDate,
        invoice_type: invoiceType,
        invoice_number: sanitizeText(input.invoiceNumber),
        observations: sanitizeText(input.observations),
        sub_total: subTotalAmount,
        total_tax_amount: taxAmounts.length ? totalTaxAmount : null,
        global_discount_percentage: normalizedGlobalDiscountPercent ?? 0,
        global_discount_amount: globalDiscountAmount,
        total_amount: totalAmount,
        status:
          "CONFIRMED" satisfies Database["public"]["Enums"]["order_status"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .eq("organization_id", org.id);

    if (updateSaleError) {
      throw new Error(
        `No se pudo confirmar la venta: ${updateSaleError.message}`
      );
    }

    const itemsPayload = items.map((item) => {
      const totals = calculateConfirmItemTotals(item);
      const usesWeight =
        item.weightQuantity !== undefined &&
        item.weightQuantity !== null &&
        item.weightQuantity > 0;

      return {
        id: item.id,
        organization_id: org.id,
        sales_order_id: saleId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_quantity: usesWeight ? (item.weightQuantity ?? null) : null,
        unit_price: item.unitPrice,
        base_price: item.basePrice ?? item.unitPrice,
        discount_amount: totals.discount,
        discount_percentage: item.discountPercentage ?? 0,
        subtotal: totals.subtotal,
      };
    });

    const { error: itemsError } = await supabase
      .from("sales_order_items")
      .upsert(itemsPayload as never);

    if (itemsError) {
      throw new Error(
        `No se pudieron actualizar los productos de la venta: ${itemsError.message}`
      );
    }

    const { error: deleteTaxesError } = await supabase
      .from("sales_order_taxes")
      .delete()
      .eq("sales_order_id", saleId)
      .eq("organization_id", org.id);

    if (deleteTaxesError) {
      throw new Error(
        `No se pudieron actualizar los impuestos: ${deleteTaxesError.message}`
      );
    }

    if (taxAmounts.length > 0) {
      const taxesPayload = taxAmounts.map((tax) => ({
        organization_id: org.id,
        sales_order_id: saleId,
        tax_id: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        base_amount: tax.baseAmount,
        tax_amount: tax.taxAmount,
      }));

      const { error: insertTaxesError } = await supabase
        .from("sales_order_taxes")
        .insert(taxesPayload);

      if (insertTaxesError) {
        throw new Error(
          `No se pudieron guardar los impuestos: ${insertTaxesError.message}`
        );
      }
    }

    try {
      const { data: receivable } = await supabase
        .from("accounts_receivable")
        .select("id")
        .eq("sales_order_id", saleId)
        .eq("organization_id", org.id)
        .maybeSingle();

      if (receivable?.id) {
        await supabase
          .from("accounts_receivable")
          .update({
            customer_id: customerId,
            total_amount: totalAmount,
            pending_balance: totalAmount,
            due_date: dueDate,
            status:
              "PENDING" satisfies Database["public"]["Enums"]["receivable_status"],
          })
          .eq("id", receivable.id);
      } else {
        await supabase.from("accounts_receivable").insert({
          organization_id: org.id,
          customer_id: customerId,
          sales_order_id: saleId,
          total_amount: totalAmount,
          pending_balance: totalAmount,
          due_date: dueDate,
          status:
            "PENDING" satisfies Database["public"]["Enums"]["receivable_status"],
        });
      }
    } catch (error) {
      console.error("Error syncing accounts receivable for sale", {
        saleId,
        error,
      });
    }

    return { status: "CONFIRMED", saleId, totalAmount };
  } catch (error) {
    if (stockAdjustmentContext) {
      await rollbackStockAdjustments(
        supabase,
        org.id,
        stockAdjustmentContext,
        appliedMovementIds
      );
    }
    throw error;
  }
}

export async function cancelSaleOrder(
  orgSlug: string,
  saleId: string
): Promise<{
  status: Database["public"]["Enums"]["order_status"];
  wasUpdated: boolean;
}> {
  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para cancelar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status === "CANCELLED") {
    return { status: sale.status, wasUpdated: false };
  }

  const shouldRestock =
    sale.status === "CONFIRMED" ||
    sale.status === "DISPATCH" ||
    sale.status === "DELIVERED";

  if (shouldRestock) {
    await restockFromSale(supabase, org.id, saleId);
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "CANCELLED" satisfies Database["public"]["Enums"]["order_status"],
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo cancelar la venta: ${updateError.message}`);
  }

  return { status: "CANCELLED", wasUpdated: true };
}

export async function dispatchSaleOrder(
  input: DispatchSaleOrderInput
): Promise<{ status: SalesOrderStatus }> {
  const { orgSlug, saleId, remittanceNumber } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  if (!remittanceNumber?.trim()) {
    throw new Error("El número de remito es requerido para despachar");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para despachar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  const currentStatus = sale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede despachar una venta cancelada");
  }

  if (currentStatus !== "CONFIRMED" && currentStatus !== "DISPATCH") {
    throw new Error("Solo las ventas confirmadas pueden despacharse");
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "DISPATCH" satisfies Database["public"]["Enums"]["order_status"],
      remittance_number: remittanceNumber.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo despachar la venta: ${updateError.message}`);
  }

  return { status: "DISPATCH" };
}

export async function deliverSaleOrder(
  input: DeliverSaleOrderInput
): Promise<{ status: SalesOrderStatus }> {
  const { orgSlug, saleId } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para entregar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  const currentStatus = sale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede entregar una venta cancelada");
  }

  if (currentStatus !== "DISPATCH" && currentStatus !== "DELIVERED") {
    throw new Error(
      "Solo las ventas despachadas pueden marcarse como entregadas"
    );
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "DELIVERED" satisfies Database["public"]["Enums"]["order_status"],
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(
      `No se pudo marcar la venta como entregada: ${updateError.message}`
    );
  }

  return { status: "DELIVERED" };
}
