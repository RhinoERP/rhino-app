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
    unit_quantity: number;
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
 * Returns all products with prices for an organization
 */
export async function getAllProductsByOrg(
  orgSlug: string
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

  const subtotal_amount = input.items.reduce((sum, item) => {
    const isWeightOrVolume =
      item.unit_quantity != null && item.unit_quantity !== item.quantity;
    const effectiveQuantity = isWeightOrVolume
      ? item.unit_quantity
      : item.quantity;
    return sum + effectiveQuantity * item.unit_cost;
  }, 0);

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

  const items = input.items.map((item) => {
    const isWeightOrVolume =
      item.unit_quantity != null && item.unit_quantity !== item.quantity;
    const effectiveQuantity = isWeightOrVolume
      ? item.unit_quantity
      : item.quantity;
    return {
      organization_id: org.id,
      purchase_order_id: purchaseOrder.id,
      product_id: item.product_id,
      quantity: Math.max(1, item.quantity),
      unit_quantity: item.unit_quantity ?? item.quantity,
      unit_cost: item.unit_cost,
      subtotal: effectiveQuantity * item.unit_cost,
    };
  });

  const { error: itemsError } = await supabase
    .from("purchase_order_items")
    .insert(items);

  if (itemsError) {
    await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);

    throw new Error(
      `Error creating purchase order items: ${itemsError.message}`
    );
  }

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

export type PurchaseOrderWithSupplier = PurchaseOrder & {
  supplier: {
    id: string;
    name: string;
  };
};

type PurchaseOrderWithSupplierRaw = PurchaseOrder & {
  supplier:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
};

/**
 * Gets all purchase orders for an organization with supplier information
 */
export async function getPurchaseOrdersByOrgSlug(
  orgSlug: string
): Promise<PurchaseOrderWithSupplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name)
    `)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching purchase orders: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((order: PurchaseOrderWithSupplierRaw) => {
    const supplier = order.supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;

    const normalizedSupplier =
      supplierData &&
      typeof supplierData === "object" &&
      "id" in supplierData &&
      "name" in supplierData
        ? supplierData
        : {
            id: order.supplier_id,
            name: "Proveedor desconocido",
          };

    return {
      ...order,
      supplier: normalizedSupplier,
    };
  }) as PurchaseOrderWithSupplier[];
}

/**
 * Gets the last N purchase orders for a specific supplier
 */
export async function getRecentPurchaseOrdersBySupplier(
  orgSlug: string,
  supplierId: string,
  limit = 3
): Promise<PurchaseOrderWithSupplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name)
    `)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Error fetching recent purchase orders: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((order: PurchaseOrderWithSupplierRaw) => {
    const supplier = order.supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;

    const normalizedSupplier =
      supplierData &&
      typeof supplierData === "object" &&
      "id" in supplierData &&
      "name" in supplierData
        ? supplierData
        : {
            id: order.supplier_id,
            name: "Proveedor desconocido",
          };

    return {
      ...order,
      supplier: normalizedSupplier,
    };
  }) as PurchaseOrderWithSupplier[];
}

/**
 * Updates the status of a purchase order
 */
export async function updatePurchaseOrderStatus(
  orgSlug: string,
  purchaseOrderId: string,
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED",
  options?: {
    delivery_date?: string;
    logistics?: string;
  }
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "IN_TRANSIT" && options) {
    if (options.delivery_date) {
      updateData.delivery_date = options.delivery_date;
    }
    if (options.logistics) {
      updateData.logistics = options.logistics;
    }
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error updating purchase order status: ${error.message}`);
  }

  if (!data) {
    throw new Error("Orden de compra no encontrada");
  }

  return data;
}

export type UpdatePurchaseOrderInput = {
  orgSlug: string;
  purchaseOrderId: string;
  supplier_id?: string;
  purchase_date?: string;
  payment_due_date?: string | null;
  remittance_number?: string | null;
  items?: {
    id?: string;
    product_id: string;
    quantity: number;
    unit_quantity: number;
    unit_cost: number;
  }[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
};

/**
 * Updates a purchase order with its items
 */
export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Update purchase order fields
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.supplier_id) {
    updateData.supplier_id = input.supplier_id;
  }
  if (input.purchase_date) {
    updateData.purchase_date = input.purchase_date;
  }
  if (input.payment_due_date !== undefined) {
    updateData.payment_due_date = input.payment_due_date;
  }
  if (input.remittance_number !== undefined) {
    updateData.remittance_number = input.remittance_number;
  }

  // Calculate new totals if items are provided
  if (input.items && input.items.length > 0) {
    const subtotal_amount = input.items.reduce((sum, item) => {
      // Si tiene unit_quantity y es peso/volumen, usar unit_quantity para el cálculo
      // De lo contrario, usar quantity
      const effectiveQuantity = item.unit_quantity ?? item.quantity;
      return sum + effectiveQuantity * item.unit_cost;
    }, 0);

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

    updateData.subtotal_amount = subtotal_amount;
    updateData.total_amount = total_amount;
  }

  const { data: purchaseOrder, error: orderError } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", input.purchaseOrderId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (orderError || !purchaseOrder) {
    throw new Error(
      `Error updating purchase order: ${orderError?.message || "Not found"}`
    );
  }

  // Update items if provided
  if (input.items) {
    // Delete existing items
    await supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", input.purchaseOrderId)
      .eq("organization_id", org.id);

    // Insert new items
    const items = input.items.map((item) => ({
      organization_id: org.id,
      purchase_order_id: input.purchaseOrderId,
      product_id: item.product_id,
      quantity: Math.max(1, item.quantity),
      unit_quantity: item.unit_quantity,
      unit_cost: item.unit_cost,
      subtotal: item.quantity * item.unit_cost,
    }));

    const { error: itemsError } = await supabase
      .from("purchase_order_items")
      .insert(items);

    if (itemsError) {
      throw new Error(
        `Error updating purchase order items: ${itemsError.message}`
      );
    }
  }

  return purchaseOrder;
}

/**
 * Gets a purchase order with all its items
 */
export async function getPurchaseOrderWithItems(
  orgSlug: string,
  purchaseOrderId: string
): Promise<
  PurchaseOrder & {
    items: (PurchaseOrderItem & {
      product_name?: string;
    })[];
  }
> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .single();

  if (orderError || !order) {
    throw new Error(
      `Error fetching purchase order: ${orderError?.message || "Not found"}`
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select(`
      *,
      product:products(id, name, sku, weight_per_unit, unit_of_measure)
    `)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  if (itemsError) {
    throw new Error(
      `Error fetching purchase order items: ${itemsError.message}`
    );
  }

  return {
    ...order,
    items: (items || []).map(
      (
        item: PurchaseOrderItem & {
          product?: {
            id: string;
            name: string;
            sku: string;
            weight_per_unit?: number | null;
            unit_of_measure?: string | null;
          } | null;
        }
      ) => ({
        ...item,
        product_name: item.product?.name || item.product_id,
        weight_per_unit: item.product?.weight_per_unit ?? null,
        unit_of_measure: item.product?.unit_of_measure ?? null,
      })
    ),
  };
}
