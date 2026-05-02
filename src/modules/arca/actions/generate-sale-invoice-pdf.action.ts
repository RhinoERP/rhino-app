"use server";

import { toArcaUserMessage } from "../errors";
import { generateAuthorizedSaleInvoicePdf } from "../server/fiscal-invoice-pdf.service";

type GenerateSaleInvoicePdfResult =
  | {
      success: true;
      html: string;
      filename: string;
    }
  | {
      success: false;
      error: string;
    };

export async function generateSaleInvoicePdfAction(input: {
  orgSlug: string;
  saleId: string;
}): Promise<GenerateSaleInvoicePdfResult> {
  try {
    const result = await generateAuthorizedSaleInvoicePdf(input);

    return {
      success: true,
      html: result.html,
      filename: result.filename,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
