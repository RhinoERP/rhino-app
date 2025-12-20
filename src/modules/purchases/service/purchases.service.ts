import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type PurchaseOrder =
  Database["public"]["Tables"]["purchase_orders"]["Row"];
export type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];
export type ProductWithPrice =
  Database["public"]["Views"]["products_with_price"]["Row"];

export type CreatePurchaseOrderInput = {
  orgSlug: string;
  supplier_id: string;
  purchase_date: string;
  payment_due_date?: string;
  remittance_number?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_cost: number;
  }[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
};

/**
 * Returns all products with prices for a specific supplier
 */
export async function getProductsBySupplier(
  orgSlug: string,
  supplierId: string
): Promise<ProductWithPrice[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products_with_price")
    .select("*")
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error fetching products: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Creates a new purchase order with its items
 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("La orden de compra debe tener al menos un producto");
  }

  const supabase = await createClient();

  const subtotal_amount = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0
  );

  // Calculate tax amounts
  const taxAmounts = (input.taxes || []).map((tax) => ({
    ...tax,
    base_amount: subtotal_amount,
    tax_amount: subtotal_amount * (tax.rate / 100),
  }));

  const total_tax_amount = taxAmounts.reduce(
    (sum, tax) => sum + tax.tax_amount,
    0
  );
  const total_amount = subtotal_amount + total_tax_amount;

  const { data: purchaseOrder, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: org.id,
      supplier_id: input.supplier_id,
      purchase_date: input.purchase_date,
      payment_due_date: input.payment_due_date,
      remittance_number: input.remittance_number,
      subtotal_amount,
      total_amount,
      status: "ORDERED",
    })
    .select("*")
    .single();

  if (orderError || !purchaseOrder) {
    throw new Error(`Error creating purchase order: ${orderError?.message}`);
  }

  const items = input.items.map((item) => ({
    organization_id: org.id,
    purchase_order_id: purchaseOrder.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    subtotal: item.quantity * item.unit_cost,
  }));

  const { error: itemsError } = await supabase
    .from("purchase_order_items")
    .insert(items);

  if (itemsError) {
    await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);

    throw new Error(
      `Error creating purchase order items: ${itemsError.message}`
    );
  }

  // Insert taxes if any
  if (taxAmounts.length > 0) {
    const taxesToInsert = taxAmounts.map((tax) => ({
      organization_id: org.id,
      purchase_order_id: purchaseOrder.id,
      tax_id: tax.tax_id,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.base_amount,
      tax_amount: tax.tax_amount,
    }));

    const { error: taxesError } = await supabase
      .from("purchase_order_taxes")
      .insert(taxesToInsert);

    if (taxesError) {
      // Clean up: delete order and items
      await supabase
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", purchaseOrder.id);
      await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", purchaseOrder.id);

      throw new Error(
        `Error creating purchase order taxes: ${taxesError.message}`
      );
    }
  }

  return purchaseOrder;
}

/**
 * Gets all purchase orders for an organization
 */
export async function getPurchaseOrdersByOrgSlug(
  orgSlug: string
): Promise<PurchaseOrder[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching purchase orders: ${error.message}`);
  }

  return data ?? [];
}
