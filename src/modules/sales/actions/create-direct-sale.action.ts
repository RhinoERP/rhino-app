"use server";

import {
  createDirectSale,
  getDirectSaleById,
} from "../service/direct-sales.service";
import type {
  CreateDirectSaleInput,
  DirectSaleDetail,
  TicketSaleData,
  TicketSaleItem,
} from "../types";
import { createDirectSaleSchema } from "../types";

function resolveTicketQuantityKind(
  unitOfMeasure?: string | null
): TicketSaleItem["quantityKind"] {
  if (
    unitOfMeasure === "KG" ||
    unitOfMeasure === "LT" ||
    unitOfMeasure === "MT"
  ) {
    return "weight";
  }

  return "units";
}

function mapDirectSaleToTicketData(sale: DirectSaleDetail): TicketSaleData {
  const items = sale.items.map((item) => ({
    quantity: Number(item.quantity ?? 0),
    product: item.product?.name ?? item.product?.sku ?? "Producto",
    subtotal: Number(item.subtotal ?? 0),
    quantityKind: resolveTicketQuantityKind(item.product?.unitOfMeasure),
  }));

  return {
    saleNumber: sale.receipt_number ?? sale.id,
    saleDate: sale.sale_date,
    items,
    subtotal: Number(sale.subtotal_amount ?? 0),
    taxAmount: Number(sale.tax_amount ?? 0),
    total: Number(sale.total_amount ?? 0),
  };
}

export type CreateDirectSaleActionResult = {
  success: boolean;
  posSaleId?: string;
  ticketSaleData?: TicketSaleData;
  error?: string;
};

export async function createDirectSaleAction(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleActionResult> {
  const parsed = createDirectSaleSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      success: false,
      error:
        issue?.message ?? "Datos inválidos para registrar la venta directa.",
    };
  }

  try {
    const result = await createDirectSale(parsed.data);
    let ticketSaleData: TicketSaleData | undefined;

    try {
      const sale = await getDirectSaleById(
        parsed.data.orgSlug,
        result.posSaleId
      );
      if (sale) {
        ticketSaleData = mapDirectSaleToTicketData(sale);
      }
    } catch (ticketError) {
      console.error(
        "Error mapping direct sale to ticket payload:",
        ticketError
      );
    }

    return {
      success: true,
      posSaleId: result.posSaleId,
      ticketSaleData,
    };
  } catch (error) {
    console.error("Error creating direct sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar la venta directa.",
    };
  }
}
