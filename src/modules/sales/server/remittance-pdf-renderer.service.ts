import "server-only";

import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
} from "../service/remittance-generator.service";
import type { SalesOrderDetail } from "../service/sales.service";

type SaleRemittancePdfDocument = {
  filename: string;
  content: Buffer;
  html: string;
  saleNumber: number | null;
};

/**
 * Renders a sale-level remittance PDF from already-fetched sale data. Pure
 * render layer (no Supabase / sales.service dependency) so it can be reused
 * from within sales.service without a circular import.
 */
export async function renderRemittancePdfDocument(params: {
  sale: SalesOrderDetail;
  type: "PRESUPUESTO" | "REMITO_FINAL";
  issuer: {
    businessName?: string | null;
    cuit?: string | null;
  };
  singlePageDuplicate: boolean;
}): Promise<SaleRemittancePdfDocument> {
  const { sale, type, issuer, singlePageDuplicate } = params;

  const remittanceData = buildRemittanceFromSale(sale, type, {
    businessName: issuer.businessName,
    cuit: issuer.cuit,
    singlePageDuplicate,
  });

  const html = generateRemittanceHTML(remittanceData);
  const content = await renderHtmlToPdfBuffer(html);

  const saleNumber = sale.sale_number ?? "sin-numero";
  const filename =
    type === "PRESUPUESTO"
      ? `Presupuesto_${saleNumber}.pdf`
      : `Remito_${saleNumber}.pdf`;

  return {
    filename,
    content,
    html,
    saleNumber: sale.sale_number ?? null,
  };
}
