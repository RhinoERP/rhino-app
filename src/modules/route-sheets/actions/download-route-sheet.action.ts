"use server";

import { generateRouteSheetPdfDocument } from "../server/route-sheet-pdf-document.service";

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
  routeSheetId: string
): Promise<DownloadRouteSheetResult> {
  try {
    const pdfDoc = await generateRouteSheetPdfDocument({
      orgSlug,
      routeSheetId,
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
