"use server";

import { toArcaUserMessage } from "../errors";
import {
  generateAuthorizedSaleInvoicePdf,
  generateAuthorizedSaleInvoicePdfDocument,
} from "../server/fiscal-invoice-pdf.service";

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

type DownloadSaleInvoicePdfResult =
  | {
      success: true;
      filename: string;
      pdfBase64: string;
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

export async function downloadSaleInvoicePdfAction(input: {
  orgSlug: string;
  saleId: string;
}): Promise<DownloadSaleInvoicePdfResult> {
  try {
    const result = await generateAuthorizedSaleInvoicePdfDocument(input);

    return {
      success: true,
      filename: result.filename,
      pdfBase64: result.content.toString("base64"),
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
