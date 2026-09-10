"use server";

import { generateRouteSheetPdfDocument } from "../server/route-sheet-pdf-document.service";
import type { RouteSheetPdfOptions } from "../service/route-sheet-pdf.service";

type DownloadRouteSheetResult =
  | {
      success: true;
      filename: string;
      pdfBase64: string;
    }
  | {
      success: false;
      error: string;
    };

export async function downloadRouteSheetAction(
  orgSlug: string,
  routeSheetId: string,
  options?: RouteSheetPdfOptions
): Promise<DownloadRouteSheetResult> {
  try {
    const pdfDoc = await generateRouteSheetPdfDocument({
      orgSlug,
      routeSheetId,
      options,
    });

    return {
      success: true,
      filename: pdfDoc.filename,
      pdfBase64: pdfDoc.content.toString("base64"),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al descargar la hoja de ruta",
    };
  }
}
