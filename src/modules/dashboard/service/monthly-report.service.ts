/**
 * Monthly Report Service
 * Generates data for monthly email reports
 */

import { createClient } from "@/lib/supabase/server";

export type MonthlyReportData = {
  organizationName: string;
  monthName: string;
  year: number;
  totalBilled: number;
  totalCollected: number;
  pendingCollection: number;
  totalBilledUSD: number;
  totalCollectedUSD: number;
  pendingCollectionUSD: number;
  topClients: Array<{ name: string; value: number; valueUsd?: number }>;
  topProducts: Array<{ name: string; value: number; valueUsd?: number }>;
  outOfStockCount: number;
  delayedOrdersCount: number;
  lowStockCount: number;
};

/**
 * Generates monthly report data for a given organization
 * @param organizationId - The organization ID
 * @param month - Month (1-12)
 * @param year - Year (e.g., 2026)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Monthly report generation requires multiple data aggregations
export async function generateMonthlyReportData(
  organizationId: string,
  month: number,
  year: number
): Promise<MonthlyReportData> {
  const supabase = await createClient();

  // Get organization name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  if (!org) {
    throw new Error("Organization not found");
  }

  // Calculate date range for the previous month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Get financial metrics
  const { data: receivables } = await supabase
    .from("accounts_receivable")
    .select(
      "total_amount, pending_balance, currency, status, sales_orders!inner(dispatched_at)"
    )
    .eq("organization_id", organizationId)
    .gte("sales_orders.dispatched_at", startDate.toISOString())
    .lte("sales_orders.dispatched_at", endDate.toISOString());

  const isUsd = (r: { currency?: string | null }) =>
    (r.currency ?? "ARS").toUpperCase() === "USD";

  const totalBilled =
    receivables?.reduce((sum, r) => sum + (isUsd(r) ? 0 : r.total_amount), 0) ??
    0;
  const totalBilledUSD =
    receivables?.reduce((sum, r) => sum + (isUsd(r) ? r.total_amount : 0), 0) ??
    0;
  const totalCollected =
    receivables?.reduce(
      (sum, r) => sum + (isUsd(r) ? 0 : r.total_amount - r.pending_balance),
      0
    ) ?? 0;
  const totalCollectedUSD =
    receivables?.reduce(
      (sum, r) => sum + (isUsd(r) ? r.total_amount - r.pending_balance : 0),
      0
    ) ?? 0;
  const pendingCollection =
    receivables?.reduce(
      (sum, r) => sum + (isUsd(r) ? 0 : r.pending_balance),
      0
    ) ?? 0;
  const pendingCollectionUSD =
    receivables?.reduce(
      (sum, r) => sum + (isUsd(r) ? r.pending_balance : 0),
      0
    ) ?? 0;

  // Get top clients by revenue
  const { data: topClientsData } = await supabase
    .from("sales_orders")
    .select(
      `
      total_amount,
      currency,
      customers!inner (
        id,
        name
      )
    `
    )
    .eq("organization_id", organizationId)
    .gte("sale_date", startDate.toISOString())
    .lte("sale_date", endDate.toISOString())
    .neq("is_historical", true)
    .order("total_amount", { ascending: false })
    .limit(100);

  // Aggregate by customer
  const clientsMap = new Map<
    string,
    { name: string; value: number; valueUsd: number }
  >();
  if (topClientsData) {
    for (const order of topClientsData) {
      if (
        order.customers &&
        typeof order.customers === "object" &&
        "id" in order.customers
      ) {
        const customer = order.customers as { id: string; name: string };
        const customerId = customer.id;
        const customerName = customer.name;
        const existing = clientsMap.get(customerId);
        const isUsdOrder = (order.currency ?? "ARS").toUpperCase() === "USD";
        if (existing) {
          if (isUsdOrder) {
            existing.valueUsd += order.total_amount;
          } else {
            existing.value += order.total_amount;
          }
        } else {
          clientsMap.set(customerId, {
            name: customerName,
            value: isUsdOrder ? 0 : order.total_amount,
            valueUsd: isUsdOrder ? order.total_amount : 0,
          });
        }
      }
    }
  }

  const topClients = Array.from(clientsMap.values())
    .sort((a, b) => b.value + b.valueUsd - (a.value + a.valueUsd))
    .slice(0, 5)
    .map((c) => ({ name: c.name, value: c.value, valueUsd: c.valueUsd }));

  // Get top products by revenue
  const { data: topProductsData } = await supabase
    .from("sales_order_items")
    .select(
      `
      quantity,
      unit_price,
      currency,
      products!inner (
        id,
        name
      ),
      sales_orders!inner (
        organization_id,
        sale_date
      )
    `
    )
    .eq("sales_orders.organization_id", organizationId)
    .gte("sales_orders.sale_date", startDate.toISOString())
    .lte("sales_orders.sale_date", endDate.toISOString())
    .limit(500);

  // Aggregate by product
  const productsMap = new Map<
    string,
    { name: string; value: number; valueUsd: number }
  >();
  if (topProductsData) {
    for (const item of topProductsData) {
      if (item.products && "name" in item.products) {
        const productId = item.products.id as string;
        const productName = item.products.name as string;
        const revenue = item.quantity * item.unit_price;
        const isUsdItem = (item.currency ?? "ARS").toUpperCase() === "USD";
        const existing = productsMap.get(productId);
        if (existing) {
          if (isUsdItem) {
            existing.valueUsd += revenue;
          } else {
            existing.value += revenue;
          }
        } else {
          productsMap.set(productId, {
            name: productName,
            value: isUsdItem ? 0 : revenue,
            valueUsd: isUsdItem ? revenue : 0,
          });
        }
      }
    }
  }

  const topProducts = Array.from(productsMap.values())
    .sort((a, b) => b.value + b.valueUsd - (a.value + a.valueUsd))
    .slice(0, 5)
    .map((p) => ({ name: p.name, value: p.value, valueUsd: p.valueUsd }));

  // Get operational alerts - using current data (not historical)
  // Query product lots to calculate stock
  const { data: stockData } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available, products!inner(id, min_stock)")
    .eq("products.organization_id", organizationId);

  // Group by product to calculate totals
  const stockMap = new Map<string, { totalStock: number; minStock: number }>();
  if (stockData) {
    for (const lot of stockData) {
      if (
        lot.products &&
        typeof lot.products === "object" &&
        "id" in lot.products
      ) {
        const product = lot.products as {
          id: string;
          min_stock: number | null;
        };
        const productId = product.id;
        const existing = stockMap.get(productId);
        if (existing) {
          existing.totalStock += lot.quantity_available;
        } else {
          stockMap.set(productId, {
            totalStock: lot.quantity_available,
            minStock: product.min_stock ?? 0,
          });
        }
      }
    }
  }

  // Count alerts
  let outOfStockCount = 0;
  let lowStockCount = 0;

  for (const [, { totalStock, minStock }] of stockMap) {
    if (totalStock <= 0) {
      outOfStockCount += 1;
    } else if (totalStock < minStock) {
      lowStockCount += 1;
    }
  }

  // Get delayed orders
  const { data: delayedOrders } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["CONFIRMED", "DISPATCH"])
    .neq("is_historical", true)
    .lt(
      "sale_date",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    ); // Older than 7 days

  const delayedOrdersCount = delayedOrders?.length ?? 0;

  // Get month name in Spanish
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  return {
    organizationName: org.name,
    monthName: monthNames[month - 1] ?? "Unknown",
    year,
    totalBilled,
    totalCollected,
    pendingCollection,
    totalBilledUSD,
    totalCollectedUSD,
    pendingCollectionUSD,
    topClients,
    topProducts,
    outOfStockCount,
    delayedOrdersCount,
    lowStockCount,
  };
}
