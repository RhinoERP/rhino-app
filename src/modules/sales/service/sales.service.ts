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
    }))
    .filter(
      (item) => item.productId && item.quantity > 0 && item.unitPrice >= 0
    );
}

export async function getSaleProducts(orgSlug: string): Promise<SaleProduct[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products_with_price")
    .select(
      "id, sku, name, brand, calculated_sale_price, organization_id, is_active"
    )
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error obteniendo productos: ${error.message}`);
  }

  return (data ?? [])
    .filter((product) => product.id && product.name && product.sku)
    .map((product) => ({
      id: product.id as string,
      name: product.name as string,
      sku: product.sku as string,
      brand: product.brand,
      price: product.calculated_sale_price ?? 0,
    }));
}

export async function createPreSaleOrder(
  input: CreatePreSaleOrderInput
): Promise<string> {
  const { orgSlug, customerId, sellerId, saleDate } = input;

  if (!customerId) {
    throw new Error("El cliente es requerido");
  }

  if (!sellerId) {
    throw new Error("El vendedor es requerido");
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

  const totalAmount = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0
  );

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
      seller_id: sellerId,
      sale_date: saleDate,
      credit_days: input.creditDays ?? null,
      expiration_date: dueDate,
      invoice_type: invoiceType,
      invoice_number: sanitizeText(input.invoiceNumber),
      observations: sanitizeText(input.observations),
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

  const itemsPayload = items.map((item) => ({
    organization_id: org.id,
    sales_order_id: saleOrderId,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.quantity * item.unitPrice,
  }));

  const { error: itemsError } = await supabase
    .from("sales_order_items")
    .insert(itemsPayload);

  if (itemsError) {
    await supabase.from("sales_orders").delete().eq("id", saleOrderId);
    throw new Error(
      `No se pudieron guardar los productos de la preventa: ${itemsError.message}`
    );
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
