import "server-only";

import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { generateRouteSheetHTML } from "../service/route-sheet-pdf.service";
import { getRouteSheetWithSales } from "../service/route-sheets.service";
import type { RouteSheetStatus } from "../types";

const ROUTE_SHEET_STATUS_LABELS: Record<RouteSheetStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completada",
};

type RouteSheetPdfDocument = {
  filename: string;
  content: Buffer;
  html: string;
};

function resolveCarrierName(
  carrier: { id: string; name: string } | null
): string | null {
  return carrier?.name ?? null;
}

export async function generateRouteSheetPdfDocument(params: {
  orgSlug: string;
  routeSheetId: string;
}): Promise<RouteSheetPdfDocument> {
  const [organization, routeSheet] = await Promise.all([
    getOrganizationBySlug(params.orgSlug),
    getRouteSheetWithSales(params.orgSlug, params.routeSheetId),
  ]);

  const carrierName = resolveCarrierName(routeSheet.carrier);

  const html = generateRouteSheetHTML({
    issuer: {
      businessName: organization?.name ?? "",
      cuit: organization?.cuit,
      logoUrl: organization?.logo_url,
    },
    carrierName,
    scheduledDate: routeSheet.scheduled_date,
    notes: routeSheet.notes,
    statusLabel: ROUTE_SHEET_STATUS_LABELS[routeSheet.status],
    rows: routeSheet.sales.map((sale) => ({
      date: sale.sale_date,
      document: sale.remittance_number || `#${sale.sale_number ?? ""}`,
      customer: sale.customer_name,
      city: sale.customer_delivery_city,
      amount: sale.total_amount,
    })),
    total: routeSheet.sales.reduce(
      (sum, sale) => sum + Number(sale.total_amount ?? 0),
      0
    ),
  });

  const content = await renderHtmlToPdfBuffer(html);

  const safeCarrier = (carrierName ?? "transporte")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .toLowerCase();
  const safeDate = routeSheet.scheduled_date.slice(0, 10);

  return {
    filename: `Hoja_de_ruta_${safeCarrier}_${safeDate}.pdf`,
    content,
    html,
  };
}
