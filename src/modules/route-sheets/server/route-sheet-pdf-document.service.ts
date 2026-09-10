import "server-only";

import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  generateRouteSheetHTML,
  type RouteSheetPdfOptions,
  type RouteSheetPdfRow,
} from "../service/route-sheet-pdf.service";
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

type SaleQuantities = {
  bultos: number | null;
  unidades: number | null;
  kilograms: number | null;
};

function resolveCarrierName(
  carrier: { id: string; name: string } | null
): string | null {
  return carrier?.name ?? null;
}

async function fetchSalesQuantities(
  orgId: string,
  saleIds: string[]
): Promise<Map<string, SaleQuantities>> {
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("sales_order_items")
    .select(
      "sales_order_id, quantity, unit_quantity, product_id, product:products(unit_of_measure, units_per_box, tracks_stock_units)"
    )
    .eq("organization_id", orgId)
    .in("sales_order_id", saleIds);

  if (error) {
    throw new Error(
      `Error al obtener las unidades de las ventas: ${error.message}`
    );
  }

  const quantitiesBySale = new Map<string, SaleQuantities>();

  for (const saleId of saleIds) {
    const saleItems = (items ?? []).filter(
      (item) => item.sales_order_id === saleId
    );
    const productItems = saleItems.filter((item) => item.product_id);

    let acc: QuantityAccumulator = createQuantityAccumulator();
    for (const item of productItems) {
      acc = accumulateItemQuantities(acc, item);
    }

    quantitiesBySale.set(saleId, {
      bultos: acc.hasBultos ? acc.bultos : null,
      unidades: acc.hasUnidades ? acc.unidades : null,
      kilograms: acc.hasKilograms ? acc.kilograms : null,
    });
  }

  return quantitiesBySale;
}

type QuantityAccumulator = {
  unidades: number;
  hasUnidades: boolean;
  kilograms: number;
  hasKilograms: boolean;
  bultos: number;
  hasBultos: boolean;
};

type SaleQuantityItem = {
  quantity: number | null;
  unit_quantity: number | null;
  product?: {
    unit_of_measure?: string | null;
    units_per_box?: number | null;
    tracks_stock_units?: boolean | null;
  } | null;
};

function createQuantityAccumulator(): QuantityAccumulator {
  return {
    unidades: 0,
    hasUnidades: false,
    kilograms: 0,
    hasKilograms: false,
    bultos: 0,
    hasBultos: false,
  };
}

type WeightQuantityInput = {
  isWeightOrVolume: boolean;
  tracksStockUnits: boolean;
  quantity: number;
  unitQuantity: number;
};

function accumulateItemQuantities(
  acc: QuantityAccumulator,
  item: SaleQuantityItem
): QuantityAccumulator {
  const measure = item.product?.unit_of_measure ?? "UN";
  const isWeightOrVolume =
    measure === "KG" || measure === "LT" || measure === "MT";
  const tracksStockUnits = Boolean(item.product?.tracks_stock_units);
  const quantity = Number(item.quantity ?? 0);
  const unitQuantity = Number(item.unit_quantity ?? 0);
  const unitsPerBox = Number(item.product?.units_per_box ?? 0);

  const next = { ...acc };

  if (!isWeightOrVolume || tracksStockUnits) {
    next.unidades += quantity;
    next.hasUnidades = true;
  }

  accumulateKilograms(next, {
    isWeightOrVolume,
    tracksStockUnits,
    quantity,
    unitQuantity,
  });

  if (unitsPerBox > 0) {
    next.bultos += Math.ceil(quantity / unitsPerBox);
    next.hasBultos = true;
  }

  return next;
}

function accumulateKilograms(
  next: QuantityAccumulator,
  input: WeightQuantityInput
): void {
  const { isWeightOrVolume, tracksStockUnits, quantity, unitQuantity } = input;

  if (!isWeightOrVolume) {
    return;
  }

  if (tracksStockUnits) {
    if (unitQuantity > 0) {
      next.kilograms += unitQuantity;
      next.hasKilograms = true;
    }
    return;
  }

  next.kilograms += unitQuantity > 0 ? unitQuantity : quantity;
  next.hasKilograms = true;
}

export async function generateRouteSheetPdfDocument(params: {
  orgSlug: string;
  routeSheetId: string;
  options?: RouteSheetPdfOptions;
}): Promise<RouteSheetPdfDocument> {
  const { orgSlug, routeSheetId, options } = params;

  const [organization, routeSheet] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getRouteSheetWithSales(orgSlug, routeSheetId),
  ]);

  const saleIds = routeSheet.sales.map((sale) => sale.id);
  const quantitiesBySale =
    saleIds.length > 0
      ? await fetchSalesQuantities(organization?.id ?? "", saleIds)
      : new Map<string, SaleQuantities>();

  const carrierName = resolveCarrierName(routeSheet.carrier);

  const rows: RouteSheetPdfRow[] = routeSheet.sales.map((sale) => {
    const quantities = quantitiesBySale.get(sale.id);
    return {
      date: sale.sale_date,
      document: sale.remittance_number || `#${sale.sale_number ?? ""}`,
      customer: sale.customer_name,
      city: sale.customer_delivery_city,
      amount: sale.total_amount,
      bultos: quantities?.bultos ?? null,
      unidades: quantities?.unidades ?? null,
      kilograms: quantities?.kilograms ?? null,
    };
  });

  const html = generateRouteSheetHTML(
    {
      issuer: {
        businessName: organization?.name ?? "",
        cuit: organization?.cuit,
        logoUrl: organization?.logo_url,
      },
      carrierName,
      scheduledDate: routeSheet.scheduled_date,
      notes: routeSheet.notes,
      statusLabel: ROUTE_SHEET_STATUS_LABELS[routeSheet.status],
      rows,
      total: routeSheet.sales.reduce(
        (sum, sale) => sum + Number(sale.total_amount ?? 0),
        0
      ),
    },
    options
  );

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
