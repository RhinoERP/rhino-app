"use server";

import { convertQuoteToSalesOrder } from "../service/quotes.service";

export type ConvertQuoteActionResult = {
  success: boolean;
  salesOrderId?: string;
  error?: string;
};

export async function convertQuoteAction(
  quoteId: string,
  orgSlug: string
): Promise<ConvertQuoteActionResult> {
  try {
    const salesOrderId = await convertQuoteToSalesOrder(quoteId, orgSlug);

    return {
      success: true,
      salesOrderId,
    };
  } catch (error) {
    console.error("Error converting quote to sales order:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al convertir el presupuesto",
    };
  }
}
