"use server";

import {
  getReturnCreditNoteTotalBySaleId,
  getReturnedQuantityTotalsBySaleId,
} from "@/modules/sales/service/sale-return.service";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";

type ActionResult =
  | {
      success: true;
      data: {
        sale: SalesOrderDetail;
        returnedQuantities: Record<string, number>;
        returnedUnitQuantities: Record<string, number>;
        existingReturnCreditNoteTotal: number;
      };
    }
  | { success: false; error: string };

export async function getReturnCreditNoteSaleDetailAction(
  orgSlug: string,
  saleId: string
): Promise<ActionResult> {
  try {
    const [sale, returnedTotals, existingReturnCreditNoteTotal] =
      await Promise.all([
        getSalesOrderById(orgSlug, saleId),
        getReturnedQuantityTotalsBySaleId(orgSlug, saleId),
        getReturnCreditNoteTotalBySaleId(orgSlug, saleId),
      ]);

    if (!sale) {
      return { success: false, error: "Venta no encontrada" };
    }

    if (sale.status !== "DISPATCH" && sale.status !== "DELIVERED") {
      return {
        success: false,
        error: "Solo se pueden devolver ventas despachadas o entregadas",
      };
    }

    return {
      success: true,
      data: {
        sale,
        returnedQuantities: returnedTotals.quantities,
        returnedUnitQuantities: returnedTotals.unitQuantities,
        existingReturnCreditNoteTotal,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cargar la venta para devolución",
    };
  }
}
