"use server";

import type { QueryData } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { INVOICE_TYPE_OPTIONS } from "../invoice-type-utils";
import { confirmSaleOrder } from "../service/sales.service";
import type { InvoiceType } from "../types";

function toInvoiceType(value: string | null): InvoiceType | undefined {
  return INVOICE_TYPE_OPTIONS.find((option) => option.value === value)?.value;
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

function draftSalesQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  saleIds: string[]
) {
  return supabase
    .from("sales_orders")
    .select(
      `id, sale_number, customer_id, user_id, sale_date, expiration_date,
       credit_days, invoice_type, invoice_number, observations,
       global_discount_percentage,
       sales_order_items(id, product_id, description, quantity, unit_quantity, unit_price, discount_percentage, quote_item_id, sales_order_item_extras(name_snapshot, price_snapshot))`
    )
    .eq("organization_id", orgId)
    .in("id", saleIds)
    .eq("status", "DRAFT");
}

type SaleRow = QueryData<ReturnType<typeof draftSalesQuery>>[number];

async function confirmOneSale(
  orgSlug: string,
  sale: SaleRow
): Promise<BulkSaleResult> {
  const saleLabel = sale.sale_number ? `#${sale.sale_number}` : sale.id;
  try {
    if (!sale.customer_id) {
      throw new Error("La venta no tiene un cliente asociado.");
    }
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
        quoteItemId: item.quote_item_id,
        extras: (item.sales_order_item_extras ?? []).map((extra) => ({
          description: extra.name_snapshot,
          price: extra.price_snapshot,
        })),
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
  await ensure("sales.manage", orgSlug);
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
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      throw new Error("Organización no encontrada");
    }

    const { data: sales, error: salesError } = await draftSalesQuery(
      supabase,
      org.id,
      saleIds
    );

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
