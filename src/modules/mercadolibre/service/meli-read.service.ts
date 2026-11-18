import "server-only";
import { z } from "zod";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getAvailableWarehouses } from "@/modules/inventory/service/warehouse-stock.service";
import { WarehouseAccessError } from "@/modules/inventory/utils/warehouse-access-error";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_READ_PERMISSIONS } from "../permissions";
import { type MeliLot, meliReceiverSchema } from "../types";
import {
  type MeliCreditReportRow,
  type MeliReportRow,
  meliReportPeriodSchema,
  summarizeMeliCommercialPeriod,
} from "../utils/commercial-report";
import { readMeliLineSnapshots } from "../utils/line-snapshots";
import { loadMeliLots, loadMeliPrices } from "./meli-catalog.repository";
import { loadMeliIssuerInvoiceTypes } from "./meli-fiscal-settings.service";

async function readContext(orgSlug: string, write = false) {
  await ensure(write ? "mercadolibre.manage" : MELI_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const warehouses = await getAvailableWarehouses(orgSlug, undefined, {
    includeInactive: true,
  });
  return { orgId: org.id, warehouses, admin: createTypedAdminClient() };
}

function receiverName(snapshot: unknown): string {
  const receiver = meliReceiverSchema.parse(snapshot);
  return receiver.tax_condition === "RESPONSABLE_INSCRIPTO"
    ? receiver.business_name
    : `${receiver.first_name} ${receiver.last_name}`;
}

export async function getMeliSetup(orgSlug: string) {
  const context = await readContext(orgSlug, true);
  const [settings, taxes, config, invoiceTypes] = await Promise.all([
    context.admin
      .from("mercadolibre_settings")
      .select("warehouse_id")
      .eq("organization_id", context.orgId)
      .maybeSingle(),
    context.admin
      .from("taxes")
      .select("id, name, rate")
      .eq("organization_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    getDirectSaleConfigByOrgSlug(orgSlug),
    loadMeliIssuerInvoiceTypes(context.admin, context.orgId),
  ]);
  if (settings.error || taxes.error) {
    throw new Error("No se pudo cargar la configuración Meli.");
  }
  const warehouse = context.warehouses.find(
    (row) =>
      row.id === settings.data?.warehouse_id &&
      row.is_active &&
      row.direct_sale_enabled
  );
  const configuredTaxIds = [...config.direct_sale_tax_ids];
  if (!configuredTaxIds.length && config.direct_sale_tax_id) {
    configuredTaxIds.push(config.direct_sale_tax_id);
  }
  return {
    warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
    taxes: taxes.data,
    invoiceTypes,
    defaultTaxIds: configuredTaxIds.filter((id) =>
      taxes.data.some((tax) => tax.id === id)
    ),
  };
}

const searchSchema = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value.replace(/[%_,()."\\]/g, " ").trim());

function isCatalogLotEligible(
  lot: MeliLot,
  hasVariants: boolean,
  activeVariants: ReadonlyMap<string, string>
) {
  return hasVariants
    ? activeVariants.get(lot.product_variant_id ?? "") === lot.product_id
    : lot.product_variant_id === null;
}
async function requireOperationalWarehouse(
  context: Awaited<ReturnType<typeof readContext>>
) {
  const settings = await context.admin
    .from("mercadolibre_settings")
    .select("warehouse_id")
    .eq("organization_id", context.orgId)
    .maybeSingle();
  if (settings.error) {
    throw new Error("No se pudo verificar el depósito Meli.");
  }
  const warehouse = context.warehouses.find(
    (row) =>
      row.id === settings.data?.warehouse_id &&
      row.is_active &&
      row.direct_sale_enabled
  );
  if (!warehouse) {
    throw new Error(
      "Configurá un depósito Meli activo y asignado a tu usuario."
    );
  }
  return warehouse;
}

export async function searchMeliProducts(orgSlug: string, search: string) {
  const term = searchSchema.parse(search);
  const context = await readContext(orgSlug, true);
  const warehouse = await requireOperationalWarehouse(context);
  let query = context.admin
    .from("products")
    .select(
      "id, name, sku, unit_of_measure, has_variants, tracks_stock_units, product_lots!inner(warehouse_id)"
    )
    .eq("organization_id", context.orgId)
    .eq("is_active", true)
    .eq("product_lots.warehouse_id", warehouse.id)
    .eq("product_lots.organization_id", context.orgId)
    .gt("product_lots.quantity_available", 0)
    .order("name")
    .limit(30);
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  const result = await query;
  if (result.error) {
    throw new Error("No se pudo consultar el catálogo Meli.");
  }
  if (!result.data.length) {
    return [];
  }
  const ids = result.data.map((product) => product.id);
  const [prices, lots, variants] = await Promise.all([
    loadMeliPrices(context.admin, context.orgId, ids),
    loadMeliLots(context.admin, context.orgId, warehouse.id, ids),
    context.admin
      .from("product_variants")
      .select("id, product_id, talle, color")
      .eq("organization_id", context.orgId)
      .eq("is_active", true)
      .in("product_id", ids),
  ]);
  if (variants.error) {
    throw new Error("No se pudieron consultar las variantes.");
  }
  const activeVariants = new Map(
    variants.data.map((variant) => [variant.id, variant.product_id])
  );
  const productsById = new Map(
    result.data.map((product) => [product.id, product])
  );
  const stockByProduct = new Map<string, number>();
  const stockByVariant = new Map<string, number>();
  for (const lot of lots) {
    const hasVariants = productsById.get(lot.product_id)?.has_variants;
    const eligible = isCatalogLotEligible(
      lot,
      Boolean(hasVariants),
      activeVariants
    );
    if (!eligible) {
      continue;
    }
    stockByProduct.set(
      lot.product_id,
      truncateToDecimals(
        (stockByProduct.get(lot.product_id) ?? 0) + lot.quantity_available,
        6
      )
    );
    if (lot.product_variant_id) {
      stockByVariant.set(
        lot.product_variant_id,
        truncateToDecimals(
          (stockByVariant.get(lot.product_variant_id) ?? 0) +
            lot.quantity_available,
          6
        )
      );
    }
  }
  return result.data.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit_of_measure,
    hasVariants: Boolean(product.has_variants),
    tracksUnits: Boolean(product.tracks_stock_units),
    price: truncateMoney(prices.get(product.id) ?? 0),
    stock: stockByProduct.get(product.id) ?? 0,
    variants: variants.data
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => ({
        id: variant.id,
        label: [variant.talle, variant.color].filter(Boolean).join(" / "),
        stock: stockByVariant.get(variant.id) ?? 0,
      })),
  }));
}

/** Inventory readers use the configured, assigned warehouse, never an SKU prefix. */
export async function getMeliStockWarehouse(
  orgSlug: string,
  requestedId?: string
) {
  const context = await readContext(orgSlug);
  const warehouse = await requireOperationalWarehouse(context);
  if (requestedId && requestedId !== warehouse.id) {
    throw new WarehouseAccessError(
      "Solo podés consultar el depósito configurado para Mercado Libre.",
      403
    );
  }
  return warehouse;
}

export async function searchMeliCustomers(orgSlug: string, search: string) {
  const term = searchSchema.parse(search);
  if (term.length < 2) {
    return [];
  }
  const context = await readContext(orgSlug, true);
  await requireOperationalWarehouse(context);
  const result = await context.admin
    .from("customers")
    .select(
      "id, business_name, fantasy_name, cuit, tax_condition, address, city"
    )
    .eq("organization_id", context.orgId)
    .eq("is_active", true)
    .or(
      `business_name.ilike.%${term}%,fantasy_name.ilike.%${term}%,cuit.ilike.%${term}%`
    )
    .order("business_name")
    .limit(20);
  if (result.error) {
    throw new Error("No se pudieron buscar los compradores.");
  }
  return result.data;
}

export async function listMeliSales(orgSlug: string, page = 1) {
  const selectedPage = z.number().int().min(1).max(100_000).parse(page);
  const { orgId, warehouses, admin } = await readContext(orgSlug);
  if (!warehouses.length) {
    return { data: [], count: 0 };
  }
  const result = await admin
    .from("sales_orders")
    .select(
      "id, status, sale_number, marketplace_order_number, sale_date, currency, total_amount, arca_status, invoice_number, fiscal_receiver_snapshot",
      { count: "exact" }
    )
    .eq("organization_id", orgId)
    .eq("sales_channel", "MERCADO_LIBRE")
    .in(
      "warehouse_id",
      warehouses.map((row) => row.id)
    )
    .order("sale_date", { ascending: false })
    .order("id", { ascending: false })
    .range((selectedPage - 1) * 20, selectedPage * 20 - 1);
  if (result.error) {
    throw new Error("No se pudieron consultar las ventas Meli.");
  }
  return {
    data: result.data.map(({ fiscal_receiver_snapshot, ...sale }) => ({
      ...sale,
      buyerName: receiverName(fiscal_receiver_snapshot),
    })),
    count: result.count ?? 0,
  };
}

export async function getMeliCommercialReport(
  orgSlug: string,
  period: { from: string; to: string }
) {
  const dates = meliReportPeriodSchema.parse(period);
  const { orgId, warehouses, admin } = await readContext(orgSlug);
  if (!warehouses.length) {
    return { period: dates, currencies: [] };
  }
  const rows: MeliReportRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await admin
      .from("sales_orders")
      .select("currency, total_amount, total_tax_amount, arca_status")
      .eq("organization_id", orgId)
      .eq("sales_channel", "MERCADO_LIBRE")
      .eq("status", "DELIVERED")
      .in(
        "warehouse_id",
        warehouses.map((warehouse) => warehouse.id)
      )
      .gte("sale_date", dates.from)
      .lte("sale_date", dates.to)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) {
      throw new Error("No se pudo consultar el reporte comercial Meli.");
    }
    rows.push(...result.data);
    if (result.data.length < 500) {
      break;
    }
  }
  const notes: MeliCreditReportRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await admin
      .from("credit_notes")
      .select("amount, arca_status, sale:sales_orders!inner(currency)")
      .eq("organization_id", orgId)
      .eq("sales_channel", "MERCADO_LIBRE")
      .eq("status", "CONFIRMED")
      .eq("sale.organization_id", orgId)
      .eq("sale.sales_channel", "MERCADO_LIBRE")
      .in(
        "sale.warehouse_id",
        warehouses.map((warehouse) => warehouse.id)
      )
      .gte("issue_date", dates.from)
      .lte("issue_date", dates.to)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) {
      throw new Error(
        "No se pudieron consultar las notas de crédito del reporte Meli."
      );
    }
    notes.push(
      ...result.data.map((note) => ({
        currency: note.sale.currency,
        amount: note.amount,
        arcaStatus: note.arca_status ?? "not_requested",
      }))
    );
    if (result.data.length < 500) {
      break;
    }
  }
  return {
    period: dates,
    currencies: summarizeMeliCommercialPeriod(rows, notes),
  };
}

export async function getMeliSale(orgSlug: string, saleId: string) {
  z.uuid().parse(saleId);
  const { orgId, warehouses, admin } = await readContext(orgSlug);
  if (!warehouses.length) {
    return null;
  }
  const result = await admin
    .from("sales_orders")
    .select(
      "id, status, sale_number, marketplace_order_number, sale_date, updated_at, currency, total_amount, sub_total, total_tax_amount, global_discount_amount, arca_status, arca_last_error, invoice_number, invoice_type, customer_id, fiscal_receiver_snapshot, commercial_snapshot, warehouse_id, items:sales_order_items(id, description, quantity, unit_quantity, unit_price, discount_amount, subtotal, variant:product_variants(talle, color)), taxes:sales_order_taxes(id, name, rate, base_amount, tax_amount)"
    )
    .eq("organization_id", orgId)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", saleId)
    .eq("items.organization_id", orgId)
    .eq("taxes.organization_id", orgId)
    .in(
      "warehouse_id",
      warehouses.map((row) => row.id)
    )
    .maybeSingle();
  if (result.error) {
    throw new Error("No se pudo consultar la venta Meli.");
  }
  if (!result.data) {
    return null;
  }
  const { fiscal_receiver_snapshot, commercial_snapshot, ...sale } =
    result.data;
  const snapshots = readMeliLineSnapshots(commercial_snapshot);
  return {
    ...sale,
    organizationId: orgId,
    items: sale.items.map((item) => {
      const snapshot = snapshots?.[item.id];
      if (snapshots && !snapshot) {
        throw new Error("Falta el snapshot de una línea de la venta Meli.");
      }
      return {
        ...item,
        description: snapshot?.name ?? item.description,
        variant: snapshot ? null : item.variant,
      };
    }),
    receiver: meliReceiverSchema.parse(fiscal_receiver_snapshot),
    warehouseName:
      warehouses.find((row) => row.id === sale.warehouse_id)?.name ?? "—",
  };
}

export async function getMeliWarehouseConfiguration(orgSlug: string) {
  await ensure("organization.admin", orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const [warehouses, settings] = await Promise.all([
    getAvailableWarehouses(orgSlug, "direct_sale"),
    createTypedAdminClient()
      .from("mercadolibre_settings")
      .select("warehouse_id")
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);
  if (settings.error) {
    throw new Error("No se pudo consultar la configuración Meli.");
  }
  return {
    warehouses: warehouses.map((row) => ({ id: row.id, name: row.name })),
    warehouseId: settings.data?.warehouse_id ?? "",
  };
}

export async function saveMeliWarehouseConfiguration(
  orgSlug: string,
  warehouseId: string
) {
  await ensure("organization.admin", orgSlug);
  z.uuid().parse(warehouseId);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const client = await createClient();
  const result = await client.rpc("save_mercadolibre_settings", {
    p_org_id: org.id,
    p_warehouse_id: warehouseId,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
}

export type MeliCatalogProduct = Awaited<
  ReturnType<typeof searchMeliProducts>
>[number];
export type MeliCustomerChoice = Awaited<
  ReturnType<typeof searchMeliCustomers>
>[number];
export type MeliSetup = Awaited<ReturnType<typeof getMeliSetup>>;
