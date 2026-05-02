"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { confirmSaleOrder } from "../service/sales.service";
import type { InvoiceType } from "../types";

const VALID_INVOICE_TYPES = new Set<string>([
  "FACTURA_A",
  "FACTURA_B",
  "FACTURA_C",
  "NOTA_DE_VENTA",
  "FACTURA_E",
]);

function toInvoiceType(value: string | null): InvoiceType | undefined {
  if (value && VALID_INVOICE_TYPES.has(value)) {
    return value as InvoiceType;
  }
}

export type BulkSaleResult = {
  saleId: string;
  saleNumber: string;
  ok: boolean;
  error?: string;
};

export type BulkActionResult = {
  success: boolean;
  results: BulkSaleResult[];
  error?: string;
};

type SaleRow = {
  id: string;
  sale_number: number | null;
  customer_id: string;
  user_id: string | null;
  sale_date: string;
  expiration_date: string | null;
  credit_days: number | null;
  invoice_type: string | null;
  invoice_number: string | null;
  observations: string | null;
  global_discount_percentage: number | null;
  sales_order_items: Array<{
    id: string;
    product_id: string | null;
    description: string | null;
    quantity: number;
    unit_quantity: number | null;
    unit_price: number;
    discount_percentage: number | null;
  }> | null;
};

async function confirmOneSale(
  orgSlug: string,
  sale: SaleRow
): Promise<BulkSaleResult> {
  const saleLabel = sale.sale_number ? `#${sale.sale_number}` : sale.id;
  try {
    await confirmSaleOrder({
      orgSlug,
      saleId: sale.id,
      customerId: sale.customer_id,
      sellerId: sale.user_id ?? "",
      saleDate: sale.sale_date,
      expirationDate: sale.expiration_date,
      creditDays: sale.credit_days,
      invoiceType: toInvoiceType(sale.invoice_type),
      invoiceNumber: sale.invoice_number,
      observations: sale.observations,
      globalDiscountPercentage: sale.global_discount_percentage,
      items: (sale.sales_order_items ?? []).map((item) => ({
        id: item.id,
        productId: item.product_id,
        description: item.description,
        quantity: item.quantity,
        weightQuantity: item.unit_quantity,
        unitPrice: item.unit_price,
        discountPercentage: item.discount_percentage,
      })),
    });
    return { saleId: sale.id, saleNumber: saleLabel, ok: true };
  } catch (err) {
    return {
      saleId: sale.id,
      saleNumber: saleLabel,
      ok: false,
      error: err instanceof Error ? err.message : "Error al confirmar",
    };
  }
}

export async function bulkConfirmSalesAction(
  orgSlug: string,
  saleIds: string[]
): Promise<BulkActionResult> {
  if (saleIds.length === 0) {
    return {
      success: false,
      results: [],
      error: "No hay ventas seleccionadas",
    };
  }

  if (saleIds.length > 20) {
    return {
      success: false,
      results: [],
      error: "No se pueden confirmar más de 20 ventas a la vez",
    };
  }

  try {
    const supabase = await createClient();

    const { data: sales, error: salesError } = await supabase
      .from("sales_orders")
      .select(
        `id, sale_number, customer_id, user_id, sale_date, expiration_date,
         credit_days, invoice_type, invoice_number, observations,
         global_discount_percentage,
         sales_order_items(id, product_id, description, quantity, unit_quantity, unit_price, discount_percentage)`
      )
      .in("id", saleIds)
      .eq("status", "DRAFT");

    if (salesError) {
      return {
        success: false,
        results: [],
        error: "Error obteniendo las ventas",
      };
    }

    const results = await Promise.all(
      (sales ?? []).map((sale) => confirmOneSale(orgSlug, sale))
    );

    revalidatePath(`/org/${orgSlug}/ventas`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return { success: true, results };
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
