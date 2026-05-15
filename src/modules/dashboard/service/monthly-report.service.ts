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
  topClients: Array<{ name: string; value: number }>;
  topProducts: Array<{ name: string; value: number }>;
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
      "total_amount, pending_balance, status, sales_orders!inner(dispatched_at)"
    )
    .eq("organization_id", organizationId)
    .gte("sales_orders.dispatched_at", startDate.toISOString())
    .lte("sales_orders.dispatched_at", endDate.toISOString());

  const totalBilled =
    receivables?.reduce((sum, r) => sum + r.total_amount, 0) ?? 0;
  const totalCollected =
    receivables?.reduce(
      (sum, r) => sum + (r.total_amount - r.pending_balance),
      0
    ) ?? 0;
  const pendingCollection =
    receivables?.reduce((sum, r) => sum + r.pending_balance, 0) ?? 0;

  // Get top clients by revenue
  const { data: topClientsData } = await supabase
    .from("sales_orders")
    .select(
      `
      total_amount,
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
  const clientsMap = new Map<string, { name: string; value: number }>();
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
        if (existing) {
          existing.value += order.total_amount;
        } else {
          clientsMap.set(customerId, {
            name: customerName,
            value: order.total_amount,
          });
        }
      }
    }
  }

  const topClients = Array.from(clientsMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Get top products by revenue
  const { data: topProductsData } = await supabase
    .from("sales_order_items")
    .select(
      `
      quantity,
      unit_price,
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
  const productsMap = new Map<string, { name: string; value: number }>();
  if (topProductsData) {
    for (const item of topProductsData) {
      if (item.products && "name" in item.products) {
        const productId = item.products.id as string;
        const productName = item.products.name as string;
        const revenue = item.quantity * item.unit_price;
        const existing = productsMap.get(productId);
        if (existing) {
          existing.value += revenue;
        } else {
          productsMap.set(productId, { name: productName, value: revenue });
        }
      }
    }
  }

  const topProducts = Array.from(productsMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

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
    topClients,
    topProducts,
    outOfStockCount,
    delayedOrdersCount,
    lowStockCount,
  };
}
