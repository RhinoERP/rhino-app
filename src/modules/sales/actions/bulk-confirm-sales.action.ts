"use server";

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

export async function bulkConfirmSalesAction(
  _orgSlug: string,
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

  await Promise.resolve();

  return {
    success: false,
    results: [],
    error:
      "La confirmación masiva está deshabilitada porque cada venta debe pasar por el modal contable antes de confirmarse.",
  };
}
