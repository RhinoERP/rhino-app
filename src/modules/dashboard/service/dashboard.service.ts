/**
 * Dashboard Service - Database Operations
 * Capa de servicios para métricas del Dashboard
 */

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  AccountsPayableProjection,
  AccountsReceivableMetrics,
  CustomerMargin,
  DashboardData,
  DashboardInsight,
  FinancialKPIs,
  MarginMetrics,
  OperationalKPIs,
  OrderStatusItem,
  OrdersMetrics,
  ProductMargin,
  PurchaseMetrics,
  RotationProduct,
  SlowMovingProduct,
  StockMetrics,
  StockProduct,
  TopClient,
  TopDebtor,
  TopProduct,
} from "../types";
import {
  calculatePercentageChange,
  getPreviousDateRange,
} from "../utils/date-utils";

const _CRITICAL_STOCK_THRESHOLD = 0.2; // 20% del stock mínimo
const SLOW_MOVING_DAYS = 60; // Sin movimiento en 60 días
const DELAYED_DAYS_THRESHOLD = 3; // Pedidos con más de 3 días de retraso

// ============================================================================
// KPIs Operativos
// ============================================================================

export async function getOperationalKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<OperationalKPIs> {
  const supabase = await createClient();
  const previousRange = getPreviousDateRange(startDate, endDate);

  // Ventas del período
  const [currentSales, previousSales] = await Promise.all([
    getSalesMetrics(supabase, organizationId, startDate, endDate),
    getSalesMetrics(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  // Pedidos pendientes de entrega
  const [currentPendingDelivery, previousPendingDelivery] = await Promise.all([
    getPendingDeliveryCount(supabase, organizationId),
    getPendingDeliveryCount(supabase, organizationId), // Snapshot anterior
  ]);

  // Compras pendientes de recibir
  const [currentPendingReceipt, previousPendingReceipt] = await Promise.all([
    getPendingReceiptCount(supabase, organizationId),
    getPendingReceiptCount(supabase, organizationId),
  ]);

  // Stock crítico
  const [currentCriticalStock, previousCriticalStock] = await Promise.all([
    getCriticalStockCount(supabase, organizationId),
    getCriticalStockCount(supabase, organizationId),
  ]);

  // Rotación promedio
  const [currentRotation, previousRotation] = await Promise.all([
    getAverageRotation(supabase, organizationId, startDate, endDate),
    getAverageRotation(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  // Clientes activos vs inactivos
  const [currentCustomers, previousCustomers] = await Promise.all([
    getCustomersMetrics(supabase, organizationId, startDate, endDate),
    getCustomersMetrics(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  return {
    sales: {
      totalAmount: currentSales.totalAmount,
      totalOrders: currentSales.totalOrders,
      percentageChange: calculatePercentageChange(
        currentSales.totalAmount,
        previousSales.totalAmount
      ),
    },
    pendingDelivery: {
      count: currentPendingDelivery,
      percentageChange: calculatePercentageChange(
        currentPendingDelivery,
        previousPendingDelivery
      ),
    },
    pendingReceipt: {
      count: currentPendingReceipt,
      percentageChange: calculatePercentageChange(
        currentPendingReceipt,
        previousPendingReceipt
      ),
    },
    criticalStock: {
      count: currentCriticalStock,
      percentageChange: calculatePercentageChange(
        currentCriticalStock,
        previousCriticalStock
      ),
    },
    averageRotation: {
      value: currentRotation,
      percentageChange: calculatePercentageChange(
        currentRotation,
        previousRotation
      ),
    },
    customers: {
      active: currentCustomers.active,
      inactive: currentCustomers.inactive,
      percentageChange: calculatePercentageChange(
        currentCustomers.active,
        previousCustomers.active
      ),
    },
  };
}

async function getSalesMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<{ totalAmount: number; totalOrders: number }> {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .not("status", "eq", "CANCELLED");

  if (error) {
    console.error(
      "Error fetching sales metrics:",
      JSON.stringify(error, null, 2)
    );
    return { totalAmount: 0, totalOrders: 0 };
  }

  const totalAmount =
    data?.reduce((sum, order) => sum + order.total_amount, 0) ?? 0;

  return {
    totalAmount,
    totalOrders: data?.length ?? 0,
  };
}

async function getPendingDeliveryCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["DRAFT", "CONFIRMED", "DISPATCH"]);

  if (error) {
    console.error("Error fetching pending delivery count:", error);
    return 0;
  }

  return count ?? 0;
}

async function getPendingReceiptCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["ORDERED", "IN_TRANSIT"]);

  if (error) {
    console.error("Error fetching pending receipt count:", error);
    return 0;
  }

  return count ?? 0;
}

async function getCriticalStockCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  // Calcular stock crítico basado en product_lots
  const { data: lots, error } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error fetching critical stock count:", error);
    return 0;
  }

  // Agrupar por producto y sumar cantidades
  const productStockMap = new Map<string, number>();
  for (const lot of lots ?? []) {
    const currentStock = productStockMap.get(lot.product_id) ?? 0;
    productStockMap.set(lot.product_id, currentStock + lot.quantity_available);
  }

  // Considerar crítico si hay menos de 10 unidades totales
  const CRITICAL_THRESHOLD = 10;
  const criticalProducts = Array.from(productStockMap.values()).filter(
    (stock) => stock < CRITICAL_THRESHOLD && stock > 0
  );

  return criticalProducts.length;
}

async function getAverageRotation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Rotación = Ventas / Stock Promedio
  // Simplificado: Suma de unidades vendidas / suma de stock actual

  const { data: salesData, error: salesError } = await supabase
    .from("sales_order_items")
    .select(
      "quantity, sales_order:sales_orders!inner(organization_id, created_at)"
    )
    .eq("sales_order.organization_id", organizationId)
    .gte("sales_order.created_at", startDate.toISOString())
    .lte("sales_order.created_at", endDate.toISOString());

  if (salesError) {
    console.error("Error fetching sales for rotation:", salesError);
    return 0;
  }

  const totalSoldUnits =
    salesData?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  // Obtener stock total desde product_lots
  const { data: stockData, error: stockError } = await supabase
    .from("product_lots")
    .select("quantity_available")
    .eq("organization_id", organizationId);

  if (stockError) {
    console.error("Error fetching stock for rotation:", stockError);
    return 0;
  }

  const totalStock =
    stockData?.reduce((sum, lot) => sum + lot.quantity_available, 0) ?? 0;

  if (totalStock === 0) {
    return 0;
  }

  return Number(totalSoldUnits / totalStock);
}

async function getCustomersMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<{ active: number; inactive: number }> {
  // Clientes activos: que compraron en el período
  const { data: activeCustomers, error: activeError } = await supabase
    .from("sales_orders")
    .select("customer_id")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .not("status", "eq", "CANCELLED");

  if (activeError) {
    console.error(
      "Error fetching active customers:",
      JSON.stringify(activeError, null, 2)
    );
    return { active: 0, inactive: 0 };
  }

  const uniqueActiveCustomers = new Set(
    activeCustomers?.map((order) => order.customer_id)
  );

  // Total de clientes
  const { count: totalCustomers, error: totalError } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (totalError) {
    console.error("Error fetching total customers:", totalError);
    return { active: uniqueActiveCustomers.size, inactive: 0 };
  }

  return {
    active: uniqueActiveCustomers.size,
    inactive: (totalCustomers ?? 0) - uniqueActiveCustomers.size,
  };
}

// ============================================================================
// Pedidos y Ventas
// ============================================================================

export async function getOrdersMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<OrdersMetrics> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_orders")
    .select("status, sale_date, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (error) {
    console.error("Error fetching orders metrics:", error);
    return { total: 0, delivered: 0, pending: 0, delayed: 0 };
  }

  const total = data?.length ?? 0;
  const delivered =
    data?.filter((order) => order.status === "DELIVERED").length ?? 0;
  const pending =
    data?.filter((order) =>
      ["DRAFT", "CONFIRMED", "DISPATCH"].includes(order.status)
    ).length ?? 0;

  // Delayed: Órdenes no entregadas con más de DELAYED_DAYS_THRESHOLD días desde creación
  const now = new Date();
  const delayed =
    data?.filter((order) => {
      if (order.status === "DELIVERED" || order.status === "CANCELLED") {
        return false;
      }
      if (!order.created_at) {
        return false;
      }
      const createdDate = new Date(order.created_at);
      const daysDiff = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysDiff > DELAYED_DAYS_THRESHOLD;
    }).length ?? 0;

  return { total, delivered, pending, delayed };
}

export async function getTopClients(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 5
): Promise<TopClient[]> {
  const supabase = await createClient();

  const { data: salesData, error } = await supabase
    .from("sales_orders")
    .select("customer_id, total_amount, customer:customers(id, business_name)")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .not("status", "eq", "CANCELLED");

  if (error) {
    console.error("Error fetching top clients:", error);
    return [];
  }

  // Agrupar por cliente
  const clientMap = new Map<
    string,
    { name: string; totalAmount: number; orderCount: number }
  >();

  for (const order of salesData ?? []) {
    if (!(order.customer_id && order.customer)) {
      continue;
    }

    const existing = clientMap.get(order.customer_id);
    if (existing) {
      existing.totalAmount += order.total_amount;
      existing.orderCount += 1;
    } else {
      clientMap.set(order.customer_id, {
        name: order.customer.business_name,
        totalAmount: order.total_amount,
        orderCount: 1,
      });
    }
  }

  return Array.from(clientMap.entries())
    .map(([id, clientData]) => ({
      id,
      name: clientData.name,
      totalAmount: clientData.totalAmount,
      orderCount: clientData.orderCount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}

export async function getTopProducts(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 5
): Promise<TopProduct[]> {
  const supabase = await createClient();

  const { data: itemsData, error } = await supabase
    .from("sales_order_items")
    .select(
      "product_id, quantity, unit_price, sales_order:sales_orders!inner(organization_id, created_at, status), product:products(id, name, sku)"
    )
    .eq("sales_order.organization_id", organizationId)
    .gte("sales_order.created_at", startDate.toISOString())
    .lte("sales_order.created_at", endDate.toISOString())
    .not("sales_order.status", "eq", "CANCELLED");

  if (error) {
    console.error(
      "Error fetching top products:",
      JSON.stringify(error, null, 2)
    );
    return [];
  }

  // Agrupar por producto
  const productMap = new Map<
    string,
    { name: string; sku: string; unitsSold: number; totalAmount: number }
  >();

  for (const item of itemsData ?? []) {
    if (!(item.product_id && item.product)) {
      continue;
    }

    const existing = productMap.get(item.product_id);
    const amount = item.quantity * item.unit_price;

    if (existing) {
      existing.unitsSold += item.quantity;
      existing.totalAmount += amount;
    } else {
      productMap.set(item.product_id, {
        name: item.product.name,
        sku: item.product.sku,
        unitsSold: item.quantity,
        totalAmount: amount,
      });
    }
  }

  return Array.from(productMap.entries())
    .map(([id, productData]) => ({
      id,
      name: productData.name,
      sku: productData.sku,
      unitsSold: productData.unitsSold,
      totalAmount: productData.totalAmount,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);
}

// ============================================================================
// Compras
// ============================================================================

export async function getPurchaseMetrics(
  organizationId: string
): Promise<PurchaseMetrics> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("status, purchase_date, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["ORDERED", "IN_TRANSIT"]);

  if (error) {
    console.error("Error fetching purchase metrics:", error);
    return { pendingReceipt: 0, averageDelayDays: 0 };
  }

  const pendingReceipt = data?.length ?? 0;

  // Calcular promedio de días de demora basado en fecha de compra
  // Como no hay received_at, usar created_at vs purchase_date como proxy
  const now = new Date();
  const delays = data
    ?.map((order) => {
      const purchaseDate = new Date(order.purchase_date);
      return Math.floor(
        (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    })
    .filter((delay) => delay > 0);

  const averageDelayDays =
    delays && delays.length > 0
      ? delays.reduce((sum, delay) => sum + delay, 0) / delays.length
      : 0;

  return { pendingReceipt, averageDelayDays: Number(averageDelayDays) };
}

// ============================================================================
// Stocks
// ============================================================================

function aggregateProductStock(
  lots: Array<{
    product_id: string;
    quantity_available: number;
    updated_at: string | null;
  }>
) {
  const productStockMap = new Map<
    string,
    { totalStock: number; lastUpdate: Date }
  >();

  for (const lot of lots) {
    const existing = productStockMap.get(lot.product_id);
    const lastUpdate = new Date(lot.updated_at ?? new Date());

    if (existing) {
      existing.totalStock += lot.quantity_available;
      if (lastUpdate > existing.lastUpdate) {
        existing.lastUpdate = lastUpdate;
      }
    } else {
      productStockMap.set(lot.product_id, {
        totalStock: lot.quantity_available,
        lastUpdate,
      });
    }
  }

  return productStockMap;
}

function categorizeStockLevel(
  totalStock: number,
  daysSinceUpdate: number
): "critical" | "healthy" | "slow" | null {
  const CRITICAL_THRESHOLD = 10;
  const HEALTHY_MIN = 10;
  const HEALTHY_MAX = 100;

  if (totalStock < CRITICAL_THRESHOLD && totalStock > 0) {
    return "critical";
  }
  if (totalStock >= HEALTHY_MIN && totalStock <= HEALTHY_MAX) {
    return "healthy";
  }
  if (daysSinceUpdate > SLOW_MOVING_DAYS) {
    return "slow";
  }
  return null;
}

export async function getStockMetrics(
  organizationId: string
): Promise<StockMetrics> {
  const supabase = await createClient();

  const { data: lots, error } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available, updated_at")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error fetching stock metrics:", error);
    return { critical: 0, healthy: 0, slow: 0 };
  }

  const productStockMap = aggregateProductStock(lots ?? []);

  let critical = 0;
  let healthy = 0;
  let slow = 0;
  const now = new Date();

  for (const [, stockData] of productStockMap) {
    const daysSinceUpdate = Math.floor(
      (now.getTime() - stockData.lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const category = categorizeStockLevel(
      stockData.totalStock,
      daysSinceUpdate
    );
    if (category === "critical") {
      critical += 1;
    } else if (category === "healthy") {
      healthy += 1;
    } else if (category === "slow") {
      slow += 1;
    }
  }

  return { critical, healthy, slow };
}

export async function getCriticalStockProducts(
  organizationId: string,
  limit = 10
): Promise<StockProduct[]> {
  const supabase = await createClient();

  // Obtener lotes con sus productos
  const { data: lotsData, error } = await supabase
    .from("product_lots")
    .select(
      "product_id, quantity_available, updated_at, product:products(id, name, sku)"
    )
    .eq("organization_id", organizationId)
    .order("quantity_available", { ascending: true });

  if (error) {
    console.error("Error fetching critical stock products:", error);
    return [];
  }

  // Agrupar por producto
  const productMap = new Map<
    string,
    {
      name: string;
      sku: string;
      totalStock: number;
      lastUpdate: Date;
    }
  >();

  for (const lot of lotsData ?? []) {
    if (!lot.product) {
      continue;
    }

    const existing = productMap.get(lot.product_id);
    const lastUpdate = new Date(lot.updated_at ?? new Date());

    if (existing) {
      existing.totalStock += lot.quantity_available;
      if (lastUpdate > existing.lastUpdate) {
        existing.lastUpdate = lastUpdate;
      }
    } else {
      productMap.set(lot.product_id, {
        name: lot.product.name,
        sku: lot.product.sku,
        totalStock: lot.quantity_available,
        lastUpdate,
      });
    }
  }

  const now = new Date();
  const CRITICAL_THRESHOLD = 10;

  return Array.from(productMap.entries())
    .filter(
      ([, productData]) =>
        productData.totalStock < CRITICAL_THRESHOLD &&
        productData.totalStock > 0
    )
    .map(([id, productData]) => ({
      id,
      name: productData.name,
      sku: productData.sku,
      currentStock: productData.totalStock,
      minimumStock: CRITICAL_THRESHOLD,
      status: "critical" as const,
      daysSinceLastMovement: Math.floor(
        (now.getTime() - productData.lastUpdate.getTime()) /
          (1000 * 60 * 60 * 24)
      ),
    }))
    .slice(0, limit);
}

// ============================================================================
// Estado de Pedidos
// ============================================================================

export async function getOrderStatusItems(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 20
): Promise<OrderStatusItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      "id, invoice_number, customer:customers(business_name), total_amount, status, created_at, sale_date"
    )
    .eq("organization_id", organizationId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching order status items:", error);
    return [];
  }

  const now = new Date();

  return (
    data?.map((order) => {
      const createdDate = new Date(order.created_at ?? new Date());
      const daysSinceCreation = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Mapear estados de DB a estados del tipo
      const statusMap: Record<string, OrderStatusItem["status"]> = {
        DRAFT: "pending",
        CONFIRMED: "confirmed",
        DISPATCH: "shipped",
        DELIVERED: "delivered",
        CANCELLED: "cancelled",
      };

      return {
        id: order.id,
        orderNumber: order.invoice_number ?? "N/A",
        customerName: order.customer?.business_name ?? "N/A",
        totalAmount: order.total_amount,
        status: statusMap[order.status] ?? "pending",
        createdAt: createdDate,
        isDelayed:
          daysSinceCreation > DELAYED_DAYS_THRESHOLD &&
          order.status !== "DELIVERED",
      };
    }) ?? []
  );
}

// ============================================================================
// Rotación
// ============================================================================

export async function getHighRotationProducts(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 10
): Promise<RotationProduct[]> {
  const supabase = await createClient();

  // Obtener ventas por producto
  const { data: salesData, error: salesError } = await supabase
    .from("sales_order_items")
    .select(
      "product_id, quantity, sales_order:sales_orders!inner(organization_id, created_at, status), product:products(id, name, sku)"
    )
    .eq("sales_order.organization_id", organizationId)
    .gte("sales_order.created_at", startDate.toISOString())
    .lte("sales_order.created_at", endDate.toISOString())
    .not("sales_order.status", "eq", "CANCELLED");

  if (salesError) {
    console.error("Error fetching high rotation products:", salesError);
    return [];
  }

  // Obtener stock por producto
  const { data: stockData, error: stockError } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available")
    .eq("organization_id", organizationId);

  if (stockError) {
    console.error("Error fetching stock for rotation:", stockError);
    return [];
  }

  // Agrupar ventas por producto
  const salesMap = new Map<
    string,
    { name: string; sku: string; totalSold: number }
  >();

  for (const item of salesData ?? []) {
    if (!item.product) {
      continue;
    }

    const existing = salesMap.get(item.product_id);
    if (existing) {
      existing.totalSold += item.quantity;
    } else {
      salesMap.set(item.product_id, {
        name: item.product.name,
        sku: item.product.sku,
        totalSold: item.quantity,
      });
    }
  }

  // Agrupar stock por producto
  const stockMap = new Map<string, number>();
  for (const lot of stockData ?? []) {
    const current = stockMap.get(lot.product_id) ?? 0;
    stockMap.set(lot.product_id, current + lot.quantity_available);
  }

  // Calcular rotación
  const rotationProducts: RotationProduct[] = [];

  for (const [productId, productSalesData] of salesMap.entries()) {
    const currentStock = stockMap.get(productId) ?? 1;
    const rotationRate = productSalesData.totalSold / currentStock;

    rotationProducts.push({
      id: productId,
      name: productSalesData.name,
      sku: productSalesData.sku,
      rotationRate: Number(rotationRate.toFixed(2)),
      salesLast30Days: productSalesData.totalSold,
      currentStock,
    });
  }

  return rotationProducts
    .sort((a, b) => b.rotationRate - a.rotationRate)
    .slice(0, limit);
}

function buildLastSaleMap(
  salesData: Array<{
    product_id: string;
    product: { name: string; sku: string } | null;
    sales_order: { created_at: string | null } | null;
  }>
) {
  const lastSaleMap = new Map<
    string,
    { date: Date; name: string; sku: string }
  >();

  for (const item of salesData) {
    if (!(item.product && item.sales_order?.created_at)) {
      continue;
    }

    if (!lastSaleMap.has(item.product_id)) {
      lastSaleMap.set(item.product_id, {
        date: new Date(item.sales_order.created_at),
        name: item.product.name,
        sku: item.product.sku,
      });
    }
  }

  return lastSaleMap;
}

function buildStockMap(
  stockData: Array<{
    product_id: string;
    quantity_available: number;
    product: { name: string; sku: string } | null;
  }>
) {
  const stockMap = new Map<
    string,
    { totalStock: number; name: string; sku: string }
  >();

  for (const lot of stockData) {
    if (!lot.product) {
      continue;
    }

    const existing = stockMap.get(lot.product_id);
    if (existing) {
      existing.totalStock += lot.quantity_available;
    } else {
      stockMap.set(lot.product_id, {
        totalStock: lot.quantity_available,
        name: lot.product.name,
        sku: lot.product.sku,
      });
    }
  }

  return stockMap;
}

function createSlowMovingProduct(
  productId: string,
  stockData: { totalStock: number; name: string; sku: string },
  lastSale: { date: Date } | undefined,
  now: Date
): SlowMovingProduct | null {
  if (lastSale) {
    const daysSinceLastSale = Math.floor(
      (now.getTime() - lastSale.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastSale > SLOW_MOVING_DAYS) {
      return {
        id: productId,
        name: stockData.name,
        sku: stockData.sku,
        daysSinceLastSale,
        currentStock: stockData.totalStock,
        lastSaleDate: lastSale.date,
      };
    }
  } else {
    return {
      id: productId,
      name: stockData.name,
      sku: stockData.sku,
      daysSinceLastSale: 999,
      currentStock: stockData.totalStock,
    };
  }

  return null;
}

export async function getSlowMovingProducts(
  organizationId: string,
  limit = 10
): Promise<SlowMovingProduct[]> {
  const supabase = await createClient();

  const { data: recentSales, error: salesError } = await supabase
    .from("sales_order_items")
    .select(
      "product_id, sales_order:sales_orders!inner(organization_id, created_at, status), product:products(id, name, sku)"
    )
    .eq("sales_order.organization_id", organizationId)
    .not("sales_order.status", "eq", "CANCELLED");

  if (salesError) {
    console.error(
      "Error fetching slow moving products:",
      JSON.stringify(salesError, null, 2)
    );
    return [];
  }

  const { data: stockData, error: stockError } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available, product:products(id, name, sku)")
    .eq("organization_id", organizationId);

  if (stockError) {
    console.error("Error fetching stock for slow moving:", stockError);
    return [];
  }

  const lastSaleMap = buildLastSaleMap(recentSales ?? []);
  const stockMap = buildStockMap(stockData ?? []);
  const now = new Date();
  const slowMovingProducts: SlowMovingProduct[] = [];

  for (const [productId, productStockData] of stockMap.entries()) {
    const lastSale = lastSaleMap.get(productId);
    const product = createSlowMovingProduct(
      productId,
      productStockData,
      lastSale,
      now
    );

    if (product) {
      slowMovingProducts.push(product);
    }
  }

  return slowMovingProducts
    .sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale)
    .slice(0, limit);
}

// ============================================================================
// KPIs Financieros
// ============================================================================

export async function getFinancialKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialKPIs> {
  const supabase = await createClient();
  const previousRange = getPreviousDateRange(startDate, endDate);

  // Facturado (Ventas totales)
  const [currentInvoiced, previousInvoiced] = await Promise.all([
    getInvoicedAmount(supabase, organizationId, startDate, endDate),
    getInvoicedAmount(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  // Cobrado
  const [currentCollected, previousCollected] = await Promise.all([
    getCollectedAmount(supabase, organizationId, startDate, endDate),
    getCollectedAmount(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  // Por Cobrar
  const [currentToCollect, previousToCollect] = await Promise.all([
    getToCollectAmount(supabase, organizationId),
    getToCollectAmount(supabase, organizationId),
  ]);

  // Por Pagar
  const [currentToPay, previousToPay] = await Promise.all([
    getToPayAmount(supabase, organizationId),
    getToPayAmount(supabase, organizationId),
  ]);

  // Margen Bruto
  const [currentMargin, previousMargin] = await Promise.all([
    getGrossMargin(supabase, organizationId, startDate, endDate),
    getGrossMargin(
      supabase,
      organizationId,
      previousRange.startDate,
      previousRange.endDate
    ),
  ]);

  return {
    invoiced: {
      amount: currentInvoiced,
      percentageChange: calculatePercentageChange(
        currentInvoiced,
        previousInvoiced
      ),
    },
    collected: {
      amount: currentCollected,
      percentageChange: calculatePercentageChange(
        currentCollected,
        previousCollected
      ),
    },
    toCollect: {
      amount: currentToCollect,
      percentageChange: calculatePercentageChange(
        currentToCollect,
        previousToCollect
      ),
    },
    toPay: {
      amount: currentToPay,
      percentageChange: calculatePercentageChange(currentToPay, previousToPay),
    },
    grossMargin: {
      amount: currentMargin.amount,
      percentage: currentMargin.percentage,
      percentageChange: calculatePercentageChange(
        currentMargin.percentage,
        previousMargin.percentage
      ),
    },
  };
}

async function getInvoicedAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .gte("sale_date", startDate.toISOString())
    .lte("sale_date", endDate.toISOString())
    .not("status", "eq", "CANCELLED");

  if (error) {
    console.error("Error fetching invoiced amount:", error);
    return 0;
  }

  return data?.reduce((sum, order) => sum + order.total_amount, 0) ?? 0;
}

async function getCollectedAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from("receivable_payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .gte("payment_date", startDate.toISOString())
    .lte("payment_date", endDate.toISOString());

  if (error) {
    console.error("Error fetching collected amount:", error);
    return 0;
  }

  return data?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
}

async function getToCollectAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("accounts_receivable")
    .select("pending_balance")
    .eq("organization_id", organizationId)
    .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"]);

  if (error) {
    console.error("Error fetching to collect amount:", error);
    return 0;
  }

  return (
    data?.reduce((sum, receivable) => sum + receivable.pending_balance, 0) ?? 0
  );
}

async function getToPayAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .in("status", ["ORDERED", "IN_TRANSIT"]);

  if (error) {
    console.error("Error fetching to pay amount:", error);
    return 0;
  }

  return data?.reduce((sum, order) => sum + order.total_amount, 0) ?? 0;
}

async function getGrossMargin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<{ amount: number; percentage: number }> {
  // Nota: Como sales_order_items no tiene unit_cost, necesitamos obtenerlo de purchase_order_items
  // o del producto. Por simplicidad, usaremos una aproximación basada en profit_margin del producto.

  const { data: salesItems, error } = await supabase
    .from("sales_order_items")
    .select(
      "quantity, unit_price, subtotal, product:products(sale_price, profit_margin), sales_order:sales_orders!inner(organization_id, sale_date, status)"
    )
    .eq("sales_order.organization_id", organizationId)
    .gte("sales_order.sale_date", startDate.toISOString())
    .lte("sales_order.sale_date", endDate.toISOString())
    .not("sales_order.status", "eq", "CANCELLED");

  if (error) {
    console.error("Error fetching gross margin:", error);
    return { amount: 0, percentage: 0 };
  }

  let totalRevenue = 0;
  let totalCost = 0;

  for (const item of salesItems ?? []) {
    const revenue = item.subtotal;
    totalRevenue += revenue;

    // Calcular costo aproximado usando profit_margin si está disponible
    if (item.product?.profit_margin) {
      // Si el margen de ganancia es X%, entonces cost = revenue / (1 + margin)
      const marginMultiplier = 1 + item.product.profit_margin / 100;
      const cost = revenue / marginMultiplier;
      totalCost += cost;
    } else {
      // Asumir margen del 30% si no hay info
      totalCost += revenue * 0.7;
    }
  }

  const marginAmount = totalRevenue - totalCost;
  const marginPercentage =
    totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0;

  return {
    amount: marginAmount,
    percentage: Number(marginPercentage.toFixed(2)),
  };
}

// ============================================================================
// Cuentas por Cobrar
// ============================================================================

export async function getAccountsReceivableMetrics(
  organizationId: string
): Promise<AccountsReceivableMetrics> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_receivable")
    .select("pending_balance, due_date")
    .eq("organization_id", organizationId)
    .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"]);

  if (error) {
    console.error("Error fetching accounts receivable metrics:", error);
    return { total: 0, overdue: 0, upcoming: 0 };
  }

  const now = new Date();
  let total = 0;
  let overdue = 0;
  let upcoming = 0;

  for (const receivable of data ?? []) {
    total += receivable.pending_balance;

    const dueDate = new Date(receivable.due_date);
    if (dueDate < now) {
      overdue += receivable.pending_balance;
    } else {
      upcoming += receivable.pending_balance;
    }
  }

  return { total, overdue, upcoming };
}

function processDebtorReceivable(
  receivable: {
    customer_id: string;
    pending_balance: number;
    due_date: string;
    customer: { business_name: string } | null;
  },
  debtorMap: Map<
    string,
    {
      customerName: string;
      totalDebt: number;
      overdueAmount: number;
      oldestInvoiceDate?: Date;
    }
  >,
  now: Date
) {
  if (!receivable.customer) {
    return;
  }

  const dueDate = new Date(receivable.due_date);
  const isOverdue = dueDate < now;

  const existing = debtorMap.get(receivable.customer_id);
  if (existing) {
    existing.totalDebt += receivable.pending_balance;
    if (isOverdue) {
      existing.overdueAmount += receivable.pending_balance;
    }
    if (!existing.oldestInvoiceDate || dueDate < existing.oldestInvoiceDate) {
      existing.oldestInvoiceDate = dueDate;
    }
  } else {
    debtorMap.set(receivable.customer_id, {
      customerName: receivable.customer.business_name,
      totalDebt: receivable.pending_balance,
      overdueAmount: isOverdue ? receivable.pending_balance : 0,
      oldestInvoiceDate: dueDate,
    });
  }
}

export async function getTopDebtors(
  organizationId: string,
  limit = 10
): Promise<TopDebtor[]> {
  const supabase = await createClient();

  const { data: receivablesData, error } = await supabase
    .from("accounts_receivable")
    .select(
      "customer_id, pending_balance, due_date, customer:customers(business_name)"
    )
    .eq("organization_id", organizationId)
    .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"])
    .order("pending_balance", { ascending: false });

  if (error) {
    console.error("Error fetching top debtors:", error);
    return [];
  }

  const debtorMap = new Map<
    string,
    {
      customerName: string;
      totalDebt: number;
      overdueAmount: number;
      oldestInvoiceDate?: Date;
    }
  >();

  const now = new Date();

  for (const receivable of receivablesData ?? []) {
    processDebtorReceivable(receivable, debtorMap, now);
  }

  return Array.from(debtorMap.entries())
    .map(([customerId, debtorData]) => ({
      customerId,
      customerName: debtorData.customerName,
      totalDebt: debtorData.totalDebt,
      overdueAmount: debtorData.overdueAmount,
      oldestInvoiceDate: debtorData.oldestInvoiceDate,
    }))
    .sort((a, b) => b.totalDebt - a.totalDebt)
    .slice(0, limit);
}

// ============================================================================
// Cuentas por Pagar
// ============================================================================

export async function getAccountsPayableProjection(
  organizationId: string
): Promise<AccountsPayableProjection> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("total_amount, payment_due_date")
    .eq("organization_id", organizationId)
    .in("status", ["ORDERED", "IN_TRANSIT"])
    .not("payment_due_date", "is", null);

  if (error) {
    console.error("Error fetching accounts payable projection:", error);
    return { next7Days: 0, next15Days: 0, next30Days: 0 };
  }

  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let amount7Days = 0;
  let amount15Days = 0;
  let amount30Days = 0;

  for (const order of data ?? []) {
    if (!order.payment_due_date) {
      continue;
    }

    const dueDate = new Date(order.payment_due_date);

    if (dueDate <= next7Days) {
      amount7Days += order.total_amount;
    }
    if (dueDate <= next15Days) {
      amount15Days += order.total_amount;
    }
    if (dueDate <= next30Days) {
      amount30Days += order.total_amount;
    }
  }

  return {
    next7Days: amount7Days,
    next15Days: amount15Days,
    next30Days: amount30Days,
  };
}

// ============================================================================
// Márgenes
// ============================================================================

export async function getMarginMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginMetrics> {
  const margin = await getGrossMargin(
    await createClient(),
    organizationId,
    startDate,
    endDate
  );

  return {
    averageMarginPercentage: margin.percentage,
    totalRevenue: margin.amount + margin.amount / (margin.percentage / 100),
    totalCost: margin.amount / (margin.percentage / 100),
  };
}

export async function getProductMargins(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 20
): Promise<ProductMargin[]> {
  const supabase = await createClient();

  const { data: orderItemsData, error } = await supabase
    .from("sales_order_items")
    .select(
      "product_id, quantity, unit_price, subtotal, product:products(name, sku, profit_margin), sales_order:sales_orders!inner(organization_id, sale_date, status)"
    )
    .eq("sales_order.organization_id", organizationId)
    .gte("sales_order.sale_date", startDate.toISOString())
    .lte("sales_order.sale_date", endDate.toISOString())
    .not("sales_order.status", "eq", "CANCELLED");

  if (error) {
    console.error("Error fetching product margins:", error);
    return [];
  }

  // Agrupar por producto
  const productMap = new Map<
    string,
    {
      name: string;
      sku: string;
      revenue: number;
      cost: number;
      profitMargin?: number;
    }
  >();

  for (const item of orderItemsData ?? []) {
    if (!item.product) {
      continue;
    }

    const revenue = item.subtotal;
    let cost = 0;

    if (item.product.profit_margin) {
      const marginMultiplier = 1 + item.product.profit_margin / 100;
      cost = revenue / marginMultiplier;
    } else {
      cost = revenue * 0.7;
    }

    const existing = productMap.get(item.product_id);
    if (existing) {
      existing.revenue += revenue;
      existing.cost += cost;
    } else {
      productMap.set(item.product_id, {
        name: item.product.name,
        sku: item.product.sku,
        revenue,
        cost,
        profitMargin: item.product.profit_margin ?? undefined,
      });
    }
  }

  return Array.from(productMap.entries())
    .map(([productId, productMarginData]) => {
      const margin = productMarginData.revenue - productMarginData.cost;
      const marginPercentage =
        productMarginData.revenue > 0
          ? (margin / productMarginData.revenue) * 100
          : 0;

      return {
        productId,
        productName: productMarginData.name,
        sku: productMarginData.sku,
        revenue: productMarginData.revenue,
        cost: productMarginData.cost,
        margin,
        marginPercentage: Number(marginPercentage.toFixed(2)),
      };
    })
    .sort((a, b) => b.margin - a.margin)
    .slice(0, limit);
}

export async function getCustomerMargins(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit = 20
): Promise<CustomerMargin[]> {
  const supabase = await createClient();

  const { data: ordersData, error } = await supabase
    .from("sales_orders")
    .select(
      "customer_id, total_amount, items:sales_order_items(subtotal, product:products(profit_margin)), customer:customers(business_name)"
    )
    .eq("organization_id", organizationId)
    .gte("sale_date", startDate.toISOString())
    .lte("sale_date", endDate.toISOString())
    .not("status", "eq", "CANCELLED");

  if (error) {
    console.error("Error fetching customer margins:", error);
    return [];
  }

  // Agrupar por cliente
  const customerMap = new Map<
    string,
    { name: string; revenue: number; cost: number }
  >();

  for (const order of ordersData ?? []) {
    if (!order.customer) {
      continue;
    }

    let orderCost = 0;
    const orderRevenue = order.total_amount;

    // Calcular costo de los items
    for (const item of order.items ?? []) {
      const revenue = item.subtotal;
      let cost = 0;

      if (item.product?.profit_margin) {
        const marginMultiplier = 1 + item.product.profit_margin / 100;
        cost = revenue / marginMultiplier;
      } else {
        cost = revenue * 0.7;
      }

      orderCost += cost;
    }

    const existing = customerMap.get(order.customer_id);
    if (existing) {
      existing.revenue += orderRevenue;
      existing.cost += orderCost;
    } else {
      customerMap.set(order.customer_id, {
        name: order.customer.business_name,
        revenue: orderRevenue,
        cost: orderCost,
      });
    }
  }

  return Array.from(customerMap.entries())
    .map(([customerId, customerMarginData]) => {
      const margin = customerMarginData.revenue - customerMarginData.cost;
      const marginPercentage =
        customerMarginData.revenue > 0
          ? (margin / customerMarginData.revenue) * 100
          : 0;

      return {
        customerId,
        customerName: customerMarginData.name,
        revenue: customerMarginData.revenue,
        cost: customerMarginData.cost,
        margin,
        marginPercentage: Number(marginPercentage.toFixed(2)),
      };
    })
    .sort((a, b) => b.margin - a.margin)
    .slice(0, limit);
}

// ============================================================================
// Insights
// ============================================================================

function createSalesInsight(
  change: number,
  insightCounter: number
): DashboardInsight | null {
  if (change > 10) {
    return {
      id: `insight-${insightCounter}`,
      type: "success",
      message: `Las ventas aumentaron ${change.toFixed(1)}% respecto al período anterior`,
      metric: "sales",
      percentageChange: change,
    };
  }
  if (change < -10) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Las ventas disminuyeron ${Math.abs(change).toFixed(1)}% respecto al período anterior`,
      metric: "sales",
      percentageChange: change,
    };
  }
  return null;
}

function createStockInsight(
  count: number,
  insightCounter: number
): DashboardInsight | null {
  if (count > 5) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Hay ${count} productos con stock crítico que requieren atención`,
      metric: "criticalStock",
    };
  }
  return null;
}

function createRotationInsight(
  rotation: number,
  insightCounter: number
): DashboardInsight | null {
  if (rotation > 2) {
    return {
      id: `insight-${insightCounter}`,
      type: "success",
      message: `Excelente rotación de inventario (${rotation.toFixed(1)}x)`,
      metric: "rotation",
    };
  }
  if (rotation < 0.5) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Rotación baja de inventario (${rotation.toFixed(1)}x). Considerar ajustar stock`,
      metric: "rotation",
    };
  }
  return null;
}

function createReceivableInsight(
  overdue: number,
  insightCounter: number
): DashboardInsight | null {
  if (overdue > 0) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Hay $${overdue.toLocaleString()} en cuentas por cobrar vencidas`,
      metric: "accountsReceivable",
    };
  }
  return null;
}

function createMarginInsight(
  margin: number,
  insightCounter: number
): DashboardInsight | null {
  if (margin > 30) {
    return {
      id: `insight-${insightCounter}`,
      type: "success",
      message: `Margen bruto saludable del ${margin.toFixed(1)}%`,
      metric: "margin",
    };
  }
  if (margin < 15) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Margen bruto bajo (${margin.toFixed(1)}%). Revisar estrategia de precios`,
      metric: "margin",
    };
  }
  return null;
}

function createDelayedInsight(
  delayed: number,
  insightCounter: number
): DashboardInsight | null {
  if (delayed > 3) {
    return {
      id: `insight-${insightCounter}`,
      type: "warning",
      message: `Hay ${delayed} pedidos demorados que requieren seguimiento`,
      metric: "delayed",
    };
  }
  return null;
}

function addInsightIfExists(
  insights: DashboardInsight[],
  insight: DashboardInsight | null
): number {
  if (insight) {
    insights.push(insight);
    return 1;
  }
  return 0;
}

export function generateDashboardInsights(
  data: Partial<DashboardData>
): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  let counter = 1;

  const salesChange = data.operationalKPIs?.sales.percentageChange;
  if (salesChange) {
    counter += addInsightIfExists(
      insights,
      createSalesInsight(salesChange, counter)
    );
  }

  const stockCount = data.operationalKPIs?.criticalStock.count;
  if (stockCount) {
    counter += addInsightIfExists(
      insights,
      createStockInsight(stockCount, counter)
    );
  }

  const rotation = data.operationalKPIs?.averageRotation.value;
  if (rotation) {
    counter += addInsightIfExists(
      insights,
      createRotationInsight(rotation, counter)
    );
  }

  const overdue = data.accountsReceivable?.overdue;
  if (overdue) {
    counter += addInsightIfExists(
      insights,
      createReceivableInsight(overdue, counter)
    );
  }

  const margin = data.financialKPIs?.grossMargin.percentage;
  if (margin) {
    counter += addInsightIfExists(
      insights,
      createMarginInsight(margin, counter)
    );
  }

  const delayed = data.ordersMetrics?.delayed;
  if (delayed) {
    counter += addInsightIfExists(
      insights,
      createDelayedInsight(delayed, counter)
    );
  }

  return insights;
}

// ============================================================================
// Función Principal
// ============================================================================

export async function getDashboardData(
  orgSlug: string,
  startDate: Date,
  endDate: Date
): Promise<DashboardData> {
  console.log("[Dashboard] Fetching data for org:", orgSlug);

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    console.error("[Dashboard] Organization not found for slug:", orgSlug);
    throw new Error(`Organización no encontrada: ${orgSlug}`);
  }

  const organizationId = org.id;
  console.log("[Dashboard] Organization ID:", organizationId);

  // Ejecutar todas las consultas en paralelo para mejor performance
  const [
    operationalKPIs,
    ordersMetrics,
    topClients,
    topProducts,
    purchaseMetrics,
    stockMetrics,
    criticalStockProducts,
    orderStatusItems,
    highRotationProducts,
    slowMovingProducts,
    financialKPIs,
    accountsReceivable,
    topDebtors,
    accountsPayable,
    marginMetrics,
    productMargins,
    customerMargins,
  ] = await Promise.all([
    getOperationalKPIs(organizationId, startDate, endDate),
    getOrdersMetrics(organizationId, startDate, endDate),
    getTopClients(organizationId, startDate, endDate),
    getTopProducts(organizationId, startDate, endDate),
    getPurchaseMetrics(organizationId),
    getStockMetrics(organizationId),
    getCriticalStockProducts(organizationId),
    getOrderStatusItems(organizationId, startDate, endDate),
    getHighRotationProducts(organizationId, startDate, endDate),
    getSlowMovingProducts(organizationId),
    getFinancialKPIs(organizationId, startDate, endDate),
    getAccountsReceivableMetrics(organizationId),
    getTopDebtors(organizationId),
    getAccountsPayableProjection(organizationId),
    getMarginMetrics(organizationId, startDate, endDate),
    getProductMargins(organizationId, startDate, endDate),
    getCustomerMargins(organizationId, startDate, endDate),
  ]);

  const dashboardData: DashboardData = {
    operationalKPIs,
    ordersMetrics,
    topClients,
    topProducts,
    purchaseMetrics,
    stockMetrics,
    criticalStockProducts,
    orderStatusItems,
    highRotationProducts,
    slowMovingProducts,
    insights: [],
    financialKPIs,
    accountsReceivable,
    topDebtors,
    accountsPayable,
    marginMetrics,
    productMargins,
    customerMargins,
  };

  // Generar insights basados en los datos
  dashboardData.insights = generateDashboardInsights(dashboardData);

  return dashboardData;
}
