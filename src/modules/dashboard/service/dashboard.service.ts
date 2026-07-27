/**
 * Dashboard Service - RPC-based Data Fetching
 * All heavy computation happens on the database server
 */

import { createClient } from "@/lib/supabase/server";
import {
  formatPosPaymentMethodLabel,
  isPosCashPaymentMethod,
} from "@/modules/pos/utils/payment-method";
import type {
  CashFlowProjectionResponse,
  CollectionAlertItem,
  CollectionsAlertsResponse,
  ControlTowerKPIsResponse,
  CustomerProfitabilityDashboardResponse,
  CustomerProfitabilityRow,
  CustomerProfitabilityStatus,
  DashboardFilters,
  DirectSalesDashboardResponse,
  FinancialBalanceResponse,
  FinancialBreakdownResponse,
  LowStockProduct,
  OrderStatusBoardResponse,
  PayableAlertItem,
  ProfitabilityGroupBy,
  ProfitabilityMetric,
  ProfitabilityMetricsResponse,
  StockHealthAlertsResponse,
  TopPerformersResponse,
} from "@/types/dashboard";

type AmountRow = {
  amount?: number | null;
  total_amount?: number | null;
  status?: string | null;
};

type ReceivablePaymentRow = {
  amount: number | null;
  payment_method: string | null;
};

type PosPaymentRow = {
  amount: number | null;
  payment_method: string | null;
};

type DirectSaleTerminalRow = {
  id: string;
  name: string;
  code: string | null;
  cash_register_number: number | null;
};

type DirectSaleRow = {
  id: string;
  sale_date: string | null;
  total_amount: number | null;
  status: string | null;
  session_id: string | null;
  payments?: PosPaymentRow[] | null;
  session?: {
    id: string;
    opened_at: string | null;
    closed_at: string | null;
    status: string;
    terminal_id: string;
    terminal?: DirectSaleTerminalRow | null;
  } | null;
};

type DirectSalesPaymentAccumulator =
  DirectSalesDashboardResponse["paymentMethods"][number];

type DirectSalesCashRegisterAccumulator =
  DirectSalesDashboardResponse["cashRegisters"][number] & {
    sessionIds: Set<string>;
  };

type ProfitabilityProduct = {
  id: string;
  name: string | null;
  brand: string | null;
};

type ProfitabilityCustomer = {
  id: string;
  business_name: string | null;
  fantasy_name: string | null;
};

type SalesOrderProfitabilityItem = {
  product_id: string | null;
  quantity: number | null;
  unit_quantity: number | null;
  subtotal: number | null;
  product: ProfitabilityProduct | ProfitabilityProduct[] | null;
};

type SalesOrderProfitabilityRow = {
  id: string;
  status: string | null;
  customer: ProfitabilityCustomer | ProfitabilityCustomer[] | null;
  items: SalesOrderProfitabilityItem[] | null;
};

type CustomerProfitabilityItem = {
  product_id: string | null;
  quantity: number | null;
  subtotal: number | null;
  unit_quantity: number | null;
};

type CustomerProfitabilitySalesOrderRow = {
  id: string;
  customer_id: string | null;
  status: string | null;
  sub_total: number | null;
  total_amount: number | null;
  customer: ProfitabilityCustomer | ProfitabilityCustomer[] | null;
  items: CustomerProfitabilityItem[] | null;
};

type CustomerProfitabilityPosSaleItem = {
  product_id: string | null;
  quantity: number | null;
  subtotal: number | null;
};

type CustomerProfitabilityPosSaleRow = {
  id: string;
  customer_id: string | null;
  status: string | null;
  subtotal_amount: number | null;
  total_amount: number | null;
  customer: ProfitabilityCustomer | ProfitabilityCustomer[] | null;
  items: CustomerProfitabilityPosSaleItem[] | null;
};

type CustomerProfitabilityReturnSale = {
  id: string;
  customer_id: string | null;
  customer: ProfitabilityCustomer | ProfitabilityCustomer[] | null;
};

type CustomerProfitabilityReturnItem = {
  product_id: string | null;
  quantity: number | null;
  unit_quantity?: number | null;
  subtotal: number | null;
};

type CustomerProfitabilitySalesReturnRow = {
  id: string;
  sales_order_id: string | null;
  total_amount: number | null;
  sale:
    | CustomerProfitabilityReturnSale
    | CustomerProfitabilityReturnSale[]
    | null;
  items: CustomerProfitabilityReturnItem[] | null;
};

type CustomerProfitabilityPosReturnRow = {
  id: string;
  pos_sale_id: string | null;
  total_amount: number | null;
  refund_amount: number | null;
  credit_note_amount: number | null;
  sale:
    | CustomerProfitabilityReturnSale
    | CustomerProfitabilityReturnSale[]
    | null;
  items: CustomerProfitabilityReturnItem[] | null;
};

type PosSaleProfitabilityItem = {
  product_id: string | null;
  quantity: number | null;
  subtotal: number | null;
  product: ProfitabilityProduct | ProfitabilityProduct[] | null;
};

type PosSaleProfitabilityRow = {
  id: string;
  status: string | null;
  customer: ProfitabilityCustomer | ProfitabilityCustomer[] | null;
  items: PosSaleProfitabilityItem[] | null;
};

type ProfitabilityAccumulator = {
  label: string;
  revenue: number;
  cogs: number;
  orderIds: Set<string>;
};

type CustomerProfitabilityAccumulator = {
  customerId: string;
  customerName: string;
  totalSales: number;
  totalCost: number;
  orderIds: Set<string>;
};

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

const CONSUMIDOR_FINAL_CUSTOMER_ID = "consumidor-final";
const CONSUMIDOR_FINAL_CUSTOMER_NAME = "Consumidor Final";
const COMPLETED_SALES_ORDER_STATUSES = [
  "CONFIRMED",
  "DISPATCH",
  "DELIVERED",
] as const;
const COMPLETED_POS_SALE_STATUS = "COMPLETED";
const SALES_RETURNS_TABLE = "sales_returns" as "sales_orders";
const POS_SALES_RETURNS_TABLE = "pos_sales_returns" as "pos_sales";

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isActiveTransaction(status?: string | null) {
  return status !== "CANCELLED";
}

// ============================================================================
// Control Tower KPIs
// ============================================================================

export async function getControlTowerKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<ControlTowerKPIsResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_control_tower_kpis", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    throw new Error(
      `Failed to fetch control tower KPIs: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as ControlTowerKPIsResponse;
}

// ============================================================================
// Top Performers
// ============================================================================

export async function getTopPerformers(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TopPerformersResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_top_performers", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
  });

  if (error) {
    throw new Error(
      `Failed to fetch top performers: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as TopPerformersResponse;
}

// ============================================================================
// Stock Health Alerts
// ============================================================================

export async function getStockHealthAlerts(
  organizationId: string,
  slowMovingDays = 90,
  filters: DashboardFilters = {}
): Promise<StockHealthAlertsResponse> {
  const supabase = await createClient();

  // Note: Signature is (p_org_id, p_supplier_id, p_slow_moving_days)
  const { data, error } = await supabase.rpc("get_stock_health_alerts", {
    p_org_id: organizationId,
    p_supplier_id: filters.supplierId || undefined,
    p_slow_moving_days: slowMovingDays,
  });

  if (error) {
    throw new Error(
      `Failed to fetch stock health alerts: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as StockHealthAlertsResponse;
}

const LOW_STOCK_THRESHOLD = 5;

function getLotStock(lotsRaw: unknown): number {
  let lots: Array<{ quantity_available: number }>;
  if (Array.isArray(lotsRaw)) {
    lots = lotsRaw;
  } else if (lotsRaw && typeof lotsRaw === "object") {
    lots = [lotsRaw as { quantity_available: number }];
  } else {
    lots = [];
  }
  return lots.reduce((s, l) => s + (l.quantity_available ?? 0), 0);
}

type VariantInfo = { talle: string; color: string; stock: number };

async function fetchVariantStocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  variantProductIds: string[]
): Promise<Map<string, VariantInfo[]>> {
  const map = new Map<string, VariantInfo[]>();
  if (variantProductIds.length === 0) {
    return map;
  }

  const { data: variantsData } = await supabase
    .from("product_variants")
    .select("product_id, talle, color, product_lots(quantity_available)")
    .eq("organization_id", organizationId)
    .in("product_id", variantProductIds)
    .eq("is_active", true);

  for (const v of variantsData ?? []) {
    const pid = v.product_id as string | undefined;
    if (!pid) {
      continue;
    }
    if (!map.has(pid)) {
      map.set(pid, []);
    }
    const stock = getLotStock(v.product_lots);
    const entry = map.get(pid);
    if (entry) {
      entry.push({
        talle: String(v.talle ?? ""),
        color: String(v.color ?? ""),
        stock,
      });
    }
  }

  return map;
}

function productRow(
  product: {
    id: string;
    name: string;
    sku: string;
    min_stock: number;
    uom: string;
  },
  stock: number,
  talle: string,
  color: string
): LowStockProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    min_stock: product.min_stock,
    current_stock: stock,
    unit_of_measure: product.uom,
    talle,
    color,
  };
}

function appendLowStockRows(
  result: LowStockProduct[],
  base: {
    id: string;
    name: string;
    sku: string;
    min_stock: number;
    uom: string;
  },
  stockById: Map<string, number>,
  variants: VariantInfo[]
) {
  const maxAllowed = base.min_stock + LOW_STOCK_THRESHOLD;
  if (variants.length > 0) {
    for (const v of variants) {
      if (v.stock <= maxAllowed) {
        result.push(productRow(base, v.stock, v.talle, v.color));
      }
    }
  } else {
    const totalStock = stockById.get(base.id) ?? 0;
    if (totalStock > 0 && totalStock <= maxAllowed) {
      result.push(productRow(base, totalStock, "", ""));
    }
  }
}

function buildLowStockResult(
  products: Array<{
    id: string | null;
    name: string | null;
    sku: string | null;
    min_stock: number | null;
    unit_of_measure: string | null;
  }>,
  stockById: Map<string, number>,
  variantMap: Map<string, VariantInfo[]>
): LowStockProduct[] {
  const result: LowStockProduct[] = [];

  for (const p of products) {
    if (!p.id) {
      continue;
    }
    const base = {
      id: p.id,
      name: p.name ?? "",
      sku: p.sku ?? "",
      min_stock: p.min_stock ?? 0,
      uom: p.unit_of_measure ?? "UN",
    };
    appendLowStockRows(result, base, stockById, variantMap.get(p.id) ?? []);
  }

  return result;
}

export async function getLowStockAlerts(
  organizationId: string
): Promise<LowStockProduct[]> {
  const supabase = await createClient();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, sku, name, min_stock, unit_of_measure")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .gt("min_stock", 0);

  if (productsError || !products) {
    return [];
  }

  const allIds = products.filter((p) => p.id).map((p) => p.id as string);
  if (allIds.length === 0) {
    return [];
  }

  const [{ data: stockData }, variantMap] = await Promise.all([
    supabase
      .from("view_stock_detail")
      .select("product_id, total_stock")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("product_id", allIds),
    fetchVariantStocks(supabase, organizationId, allIds),
  ]);

  const stockById = new Map<string, number>();
  for (const row of stockData ?? []) {
    if (row.product_id) {
      stockById.set(row.product_id, row.total_stock ?? 0);
    }
  }

  return buildLowStockResult(products, stockById, variantMap);
}

// ============================================================================
// Financial Balance
// ============================================================================

export async function getFinancialBalance(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<FinancialBalanceResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_financial_balance", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    throw new Error(
      `Failed to fetch financial balance: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as FinancialBalanceResponse;
}

// ============================================================================
// Financial Breakdown
// ============================================================================

export async function getFinancialBreakdown(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<FinancialBreakdownResponse> {
  const supabase = await createClient();
  const dateFrom = toDateOnly(startDate);
  const dateTo = toDateOnly(endDate);

  let normalSalesQuery = supabase
    .from("sales_orders")
    .select("total_amount, status")
    .eq("organization_id", organizationId)
    .gte("sale_date", dateFrom)
    .lte("sale_date", dateTo)
    .neq("is_historical", true);

  if (filters.customerId) {
    normalSalesQuery = normalSalesQuery.eq("customer_id", filters.customerId);
  }

  let directSalesQuery = supabase
    .from("pos_sales")
    .select("total_amount, status")
    .eq("organization_id", organizationId)
    .gte("sale_date", dateFrom)
    .lte("sale_date", dateTo);

  if (filters.customerId) {
    directSalesQuery = directSalesQuery.eq("customer_id", filters.customerId);
  }

  let receivableCashQuery = supabase
    .from("receivable_payments")
    .select(
      `
        amount,
        payment_method,
        accounts_receivable!inner(customer_id)
      `
    )
    .eq("organization_id", organizationId)
    .eq("payment_method", "efectivo")
    .gte("payment_date", dateFrom)
    .lte("payment_date", dateTo);

  if (filters.customerId) {
    receivableCashQuery = receivableCashQuery.eq(
      "accounts_receivable.customer_id",
      filters.customerId
    );
  }

  let directSalesCashQuery = supabase
    .from("pos_payments")
    .select(
      `
        amount,
        payment_method,
        pos_sales!inner(organization_id, sale_date, status, customer_id)
      `
    )
    .eq("pos_sales.organization_id", organizationId)
    .gte("pos_sales.sale_date", dateFrom)
    .lte("pos_sales.sale_date", dateTo);

  if (filters.customerId) {
    directSalesCashQuery = directSalesCashQuery.eq(
      "pos_sales.customer_id",
      filters.customerId
    );
  }

  const [
    normalSalesResult,
    directSalesResult,
    receivableCashResult,
    directSalesCashResult,
  ] = await Promise.all([
    normalSalesQuery,
    directSalesQuery,
    receivableCashQuery,
    directSalesCashQuery,
  ]);

  if (normalSalesResult.error) {
    throw new Error(
      `Failed to fetch normal sales breakdown: ${normalSalesResult.error.message}`
    );
  }

  if (directSalesResult.error) {
    throw new Error(
      `Failed to fetch direct sales breakdown: ${directSalesResult.error.message}`
    );
  }

  if (receivableCashResult.error) {
    throw new Error(
      `Failed to fetch receivable cash breakdown: ${receivableCashResult.error.message}`
    );
  }

  if (directSalesCashResult.error) {
    throw new Error(
      `Failed to fetch direct sales cash breakdown: ${directSalesCashResult.error.message}`
    );
  }

  const normalSales = ((normalSalesResult.data ?? []) as AmountRow[]).filter(
    (sale) => isActiveTransaction(sale.status)
  );
  const directSales = ((directSalesResult.data ?? []) as AmountRow[]).filter(
    (sale) => isActiveTransaction(sale.status)
  );
  const receivableCashPayments = (receivableCashResult.data ??
    []) as ReceivablePaymentRow[];
  const directSalesCashPayments = (
    (directSalesCashResult.data ?? []) as Array<
      PosPaymentRow & { pos_sales?: { status?: string | null } | null }
    >
  ).filter(
    (payment) =>
      isPosCashPaymentMethod(String(payment.payment_method ?? "")) &&
      isActiveTransaction(payment.pos_sales?.status)
  );

  const normalSalesAmount = normalSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount ?? 0),
    0
  );
  const directSalesAmount = directSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount ?? 0),
    0
  );
  const receivableCash = receivableCashPayments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );
  const directSalesCash = directSalesCashPayments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );

  return {
    invoicing: {
      total: toMoney(normalSalesAmount + directSalesAmount),
      normalSales: toMoney(normalSalesAmount),
      directSales: toMoney(directSalesAmount),
      normalSalesCount: normalSales.length,
      directSalesCount: directSales.length,
    },
    cashCollections: {
      totalCash: toMoney(receivableCash + directSalesCash),
      receivableCash: toMoney(receivableCash),
      directSalesCash: toMoney(directSalesCash),
      receivablePaymentsCount: receivableCashPayments.length,
      directPaymentsCount: directSalesCashPayments.length,
    },
  };
}

// ============================================================================
// Direct Sales Dashboard
// ============================================================================

function getSalePaymentsAmount(payments: PosPaymentRow[]) {
  return payments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );
}

function getSaleCashAmount(payments: PosPaymentRow[]) {
  return payments
    .filter((payment) =>
      isPosCashPaymentMethod(String(payment.payment_method ?? ""))
    )
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
}

function addPaymentMethods(
  paymentMethods: Map<string, DirectSalesPaymentAccumulator>,
  payments: PosPaymentRow[]
) {
  for (const payment of payments) {
    const paymentMethod = String(payment.payment_method ?? "otro");
    const current = paymentMethods.get(paymentMethod) ?? {
      paymentMethod,
      label: formatPosPaymentMethodLabel(paymentMethod),
      amount: 0,
      count: 0,
    };

    current.amount += Number(payment.amount ?? 0);
    current.count += 1;
    paymentMethods.set(paymentMethod, current);
  }
}

function createCashRegisterAccumulator(
  sale: DirectSaleRow,
  sessionId: string,
  terminalsById: Map<string, DirectSaleTerminalRow>
): DirectSalesCashRegisterAccumulator {
  const sessionTerminalId = sale.session?.terminal_id ?? null;
  const terminal =
    (sessionTerminalId ? terminalsById.get(sessionTerminalId) : undefined) ??
    sale.session?.terminal;

  return {
    sessionId,
    terminalId: sessionTerminalId ?? terminal?.id ?? "sin-terminal",
    terminalName: terminal?.name ?? "Caja sin terminal",
    terminalCode: terminal?.code ?? null,
    cashRegisterNumber: terminal?.cash_register_number ?? null,
    openedAt: sale.session?.opened_at ?? null,
    closedAt: sale.session?.closed_at ?? null,
    status: sale.session?.status ?? "UNKNOWN",
    sessionCount: 0,
    sessionIds: new Set<string>(),
    totalSales: 0,
    cashAmount: 0,
    paymentAmount: 0,
    salesCount: 0,
  };
}

function addCashRegisterSale(params: {
  cashRegisters: Map<string, DirectSalesCashRegisterAccumulator>;
  sale: DirectSaleRow;
  saleCashAmount: number;
  salePaymentsAmount: number;
  terminalsById: Map<string, DirectSaleTerminalRow>;
}) {
  const {
    cashRegisters,
    sale,
    saleCashAmount,
    salePaymentsAmount,
    terminalsById,
  } = params;
  const sessionId = sale.session?.id ?? sale.session_id ?? "sin-sesion";
  const registerId =
    sale.session?.terminal_id ?? sale.session?.terminal?.id ?? sessionId;
  const register =
    cashRegisters.get(registerId) ??
    createCashRegisterAccumulator(sale, sessionId, terminalsById);

  register.sessionIds.add(sessionId);
  register.sessionCount = register.sessionIds.size;
  if (sale.session?.status === "OPEN") {
    register.status = "OPEN";
    register.closedAt = null;
  }
  if (
    sale.session?.opened_at &&
    (!register.openedAt ||
      new Date(sale.session.opened_at).getTime() >
        new Date(register.openedAt).getTime())
  ) {
    register.openedAt = sale.session.opened_at;
  }

  register.totalSales += Number(sale.total_amount ?? 0);
  register.cashAmount += saleCashAmount;
  register.paymentAmount += salePaymentsAmount;
  register.salesCount += 1;
  cashRegisters.set(registerId, register);
}

function buildDirectSalesDashboardResponse(
  directSales: DirectSaleRow[],
  terminalsById: Map<string, DirectSaleTerminalRow>
): DirectSalesDashboardResponse {
  const totalAmount = directSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount ?? 0),
    0
  );
  const paymentMethods = new Map<string, DirectSalesPaymentAccumulator>();
  const cashRegisters = new Map<string, DirectSalesCashRegisterAccumulator>();
  let cashAmount = 0;

  for (const sale of directSales) {
    const payments = sale.payments ?? [];
    const saleCashAmount = getSaleCashAmount(payments);
    const salePaymentsAmount = getSalePaymentsAmount(payments);

    cashAmount += saleCashAmount;
    addPaymentMethods(paymentMethods, payments);
    addCashRegisterSale({
      cashRegisters,
      sale,
      saleCashAmount,
      salePaymentsAmount,
      terminalsById,
    });
  }

  return {
    summary: {
      currentMonthSalesCount: directSales.length,
      currentMonthTotalAmount: toMoney(totalAmount),
      currentMonthAverageTicket:
        directSales.length > 0 ? toMoney(totalAmount / directSales.length) : 0,
      currentMonthCashAmount: toMoney(cashAmount),
    },
    paymentMethods: Array.from(paymentMethods.values())
      .map((paymentMethod) => ({
        ...paymentMethod,
        amount: toMoney(paymentMethod.amount),
      }))
      .sort((a, b) => b.amount - a.amount),
    cashRegisters: Array.from(cashRegisters.values())
      .map(({ sessionIds: _sessionIds, ...register }) => ({
        ...register,
        totalSales: toMoney(register.totalSales),
        cashAmount: toMoney(register.cashAmount),
        paymentAmount: toMoney(register.paymentAmount),
      }))
      .sort((a, b) => b.totalSales - a.totalSales),
  };
}

export async function getDirectSalesDashboard(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<DirectSalesDashboardResponse> {
  const supabase = await createClient();
  const dateFrom = toDateOnly(startDate);
  const dateTo = toDateOnly(endDate);

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
        id,
        sale_date,
        total_amount,
        status,
        session_id,
        payments:pos_payments(amount, payment_method),
        session:pos_sessions(
          id,
          opened_at,
          closed_at,
          status,
          terminal_id,
          terminal:pos_terminals(id, name, code, cash_register_number)
        )
      `
    )
    .eq("organization_id", organizationId)
    .gte("sale_date", dateFrom)
    .lte("sale_date", dateTo)
    .order("sale_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch direct sales dashboard: ${error.message}`);
  }

  const directSales = ((data ?? []) as unknown as DirectSaleRow[]).filter(
    (sale) => isActiveTransaction(sale.status)
  );

  const terminalIds = Array.from(
    new Set(
      directSales
        .map((sale) => sale.session?.terminal_id)
        .filter((terminalId): terminalId is string => Boolean(terminalId))
    )
  );
  let terminalsById = new Map<string, DirectSaleTerminalRow>();

  if (terminalIds.length > 0) {
    const { data: terminals, error: terminalsError } = await supabase
      .from("pos_terminals")
      .select("id, name, code, cash_register_number")
      .eq("organization_id", organizationId)
      .in("id", terminalIds);

    if (terminalsError) {
      throw new Error(
        `Failed to fetch direct sales terminals: ${terminalsError.message}`
      );
    }

    terminalsById = new Map(
      ((terminals ?? []) as DirectSaleTerminalRow[]).map((terminal) => [
        terminal.id,
        terminal,
      ])
    );
  }

  return buildDirectSalesDashboardResponse(directSales, terminalsById);
}

// ============================================================================
// Order Status Board
// ============================================================================

export async function getOrderStatusBoard(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<OrderStatusBoardResponse> {
  const supabase = await createClient();

  // Note: Only accepts customer filter, not supplier
  const { data, error } = await supabase.rpc("get_order_status_board", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
  });

  if (error) {
    throw new Error(
      `Failed to fetch order status board: ${error.message || JSON.stringify(error)}`
    );
  }

  return (data as OrderStatusBoardResponse) || [];
}

// ============================================================================
// Cash Flow Projection (NEW)
// ============================================================================

export async function getCashFlowProjection(
  organizationId: string,
  weeksLookahead = 5,
  filters: DashboardFilters = {}
): Promise<CashFlowProjectionResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_cash_flow_projection", {
    p_org_id: organizationId,
    p_weeks_lookahead: weeksLookahead,
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    throw new Error(
      `Failed to fetch cash flow projection: ${error.message || JSON.stringify(error)}`
    );
  }

  return (data as CashFlowProjectionResponse) || [];
}

// ============================================================================
// Profitability Metrics
// ============================================================================

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getCustomerLabel(customer: ProfitabilityCustomer | null) {
  return (
    customer?.fantasy_name?.trim() ||
    customer?.business_name?.trim() ||
    CONSUMIDOR_FINAL_CUSTOMER_NAME
  );
}

function getCustomerProfitabilityStatus(
  marginPercent: number
): CustomerProfitabilityStatus {
  if (marginPercent >= 30) {
    return "bueno";
  }

  if (marginPercent >= 15) {
    return "regular";
  }

  return "bajo";
}

function getCustomerProfitabilityQuantity(item: CustomerProfitabilityItem) {
  return Number(item.unit_quantity ?? item.quantity ?? 0);
}

function getCustomerProfitabilitySaleRevenue(
  sale: CustomerProfitabilitySalesOrderRow
) {
  return Number(sale.sub_total ?? sale.total_amount ?? 0);
}

function isCompletedSalesOrderStatus(status?: string | null) {
  return COMPLETED_SALES_ORDER_STATUSES.includes(
    status as (typeof COMPLETED_SALES_ORDER_STATUSES)[number]
  );
}

function isCompletedPosSaleStatus(status?: string | null) {
  return status === COMPLETED_POS_SALE_STATUS;
}

function isProfitabilityReturnsSchemaError(error: PostgrestLikeError) {
  const normalizedMessage = String(error.message ?? "").toLowerCase();
  const referencesReturnsSchema =
    normalizedMessage.includes("sales_returns") ||
    normalizedMessage.includes("sales_return_items") ||
    normalizedMessage.includes("pos_sales_returns") ||
    normalizedMessage.includes("pos_sales_return_items");

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST200" ||
    error.code === "PGRST201" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return referencesReturnsSchema || normalizedMessage.includes("schema");
  }

  return (
    referencesReturnsSchema &&
    (normalizedMessage.includes("does not exist") ||
      normalizedMessage.includes("could not find") ||
      normalizedMessage.includes("relationship") ||
      normalizedMessage.includes("column") ||
      normalizedMessage.includes("relation"))
  );
}

function warnUnavailableCustomerProfitabilityReturns(params: {
  source: "sales_returns" | "pos_sales_returns";
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  error: PostgrestLikeError;
}) {
  console.warn("[dashboard:customer-profitability] Returns unavailable", {
    source: params.source,
    organizationId: params.organizationId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    message: params.error.message ?? null,
    code: params.error.code ?? null,
  });
}

function getCustomerKeyAndName(params: {
  customerId?: string | null;
  customer?: ProfitabilityCustomer | null;
}) {
  const customerId = params.customerId ?? params.customer?.id ?? null;

  if (!customerId) {
    return {
      customerId: CONSUMIDOR_FINAL_CUSTOMER_ID,
      customerName: CONSUMIDOR_FINAL_CUSTOMER_NAME,
    };
  }

  return {
    customerId,
    customerName: getCustomerLabel(params.customer ?? null),
  };
}

function addCustomerProfitabilityEvent(params: {
  rows: Map<string, CustomerProfitabilityAccumulator>;
  customerId: string;
  customerName: string;
  revenue: number;
  cogs: number;
  orderId?: string;
}) {
  const current = params.rows.get(params.customerId) ?? {
    customerId: params.customerId,
    customerName: params.customerName,
    totalSales: 0,
    totalCost: 0,
    orderIds: new Set<string>(),
  };

  current.totalSales += params.revenue;
  current.totalCost += params.cogs;

  if (params.orderId) {
    current.orderIds.add(params.orderId);
  }

  params.rows.set(params.customerId, current);
}

function buildCustomerProfitabilityRows(
  rows: Map<string, CustomerProfitabilityAccumulator>
) {
  return Array.from(rows.values())
    .map<CustomerProfitabilityRow>((row) => {
      const totalSales = toMoney(row.totalSales);
      const totalProfit = toMoney(row.totalSales - row.totalCost);
      const marginPercent =
        totalSales > 0 ? toMoney((totalProfit / totalSales) * 100) : 0;

      return {
        customerId: row.customerId,
        customerName: row.customerName,
        totalSales,
        totalProfit,
        marginPercent,
        orderCount: row.orderIds.size,
        status: getCustomerProfitabilityStatus(marginPercent),
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

async function fetchCustomerProfitabilitySalesReturns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  dateFrom: string,
  dateTo: string
): Promise<CustomerProfitabilitySalesReturnRow[]> {
  const { data, error } = await supabase
    .from(SALES_RETURNS_TABLE)
    .select(
      `
        id,
        sales_order_id,
        total_amount,
        sale:sales_orders!inner(
          id,
          customer_id,
          customer:customers(id, business_name, fantasy_name)
        ),
        items:sales_return_items(
          product_id,
          quantity,
          unit_quantity,
          subtotal
        )
      `
    )
    .eq("organization_id", organizationId)
    .gte("return_date" as never, dateFrom)
    .lte("return_date" as never, dateTo);

  if (error) {
    if (isProfitabilityReturnsSchemaError(error)) {
      warnUnavailableCustomerProfitabilityReturns({
        source: "sales_returns",
        organizationId,
        dateFrom,
        dateTo,
        error,
      });
      return [];
    }

    throw new Error(
      `Failed to fetch sales return profitability rows: ${error.message}`
    );
  }

  return (data ?? []) as unknown as CustomerProfitabilitySalesReturnRow[];
}

async function fetchCustomerProfitabilityPosReturns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  dateFrom: string,
  dateTo: string
): Promise<CustomerProfitabilityPosReturnRow[]> {
  const { data, error } = await supabase
    .from(POS_SALES_RETURNS_TABLE)
    .select(
      `
        id,
        pos_sale_id,
        total_amount,
        refund_amount,
        credit_note_amount,
        sale:pos_sales!inner(
          id,
          customer_id,
          customer:customers(id, business_name, fantasy_name)
        ),
        items:pos_sales_return_items(
          product_id,
          quantity,
          subtotal
        )
      `
    )
    .eq("organization_id", organizationId)
    .gte("return_date" as never, dateFrom)
    .lte("return_date" as never, dateTo);

  if (error) {
    if (isProfitabilityReturnsSchemaError(error)) {
      warnUnavailableCustomerProfitabilityReturns({
        source: "pos_sales_returns",
        organizationId,
        dateFrom,
        dateTo,
        error,
      });
      return [];
    }

    throw new Error(
      `Failed to fetch POS return profitability rows: ${error.message}`
    );
  }

  return (data ?? []) as unknown as CustomerProfitabilityPosReturnRow[];
}

function getCustomerProfitabilityPosSaleRevenue(
  sale: CustomerProfitabilityPosSaleRow
) {
  return Number(sale.subtotal_amount ?? sale.total_amount ?? 0);
}

function getCustomerProfitabilityPosQuantity(
  item: CustomerProfitabilityPosSaleItem
) {
  return Number(item.quantity ?? 0);
}

function getCustomerProfitabilityReturnQuantity(
  item: CustomerProfitabilityReturnItem
) {
  return Number(item.unit_quantity ?? item.quantity ?? 0);
}

function getCustomerProfitabilityReturnRevenue(
  items: CustomerProfitabilityReturnItem[] | null,
  fallbackAmount: number
) {
  if (!items?.length) {
    return Number(fallbackAmount);
  }

  return items.reduce((total, item) => total + Number(item.subtotal ?? 0), 0);
}

function getCustomerProfitabilityProductIds(params: {
  sales: CustomerProfitabilitySalesOrderRow[];
  posSales: CustomerProfitabilityPosSaleRow[];
  salesReturns: CustomerProfitabilitySalesReturnRow[];
  posReturns: CustomerProfitabilityPosReturnRow[];
}) {
  const { sales, posSales, salesReturns, posReturns } = params;
  const productIds = [
    ...sales.flatMap((sale) => sale.items ?? []),
    ...posSales.flatMap((sale) => sale.items ?? []),
    ...salesReturns.flatMap((saleReturn) => saleReturn.items ?? []),
    ...posReturns.flatMap((posReturn) => posReturn.items ?? []),
  ].map((item) => item.product_id);

  return productIds.filter((productId): productId is string =>
    Boolean(productId)
  );
}

function addCustomerProfitabilitySalesRows(params: {
  rows: Map<string, CustomerProfitabilityAccumulator>;
  sales: CustomerProfitabilitySalesOrderRow[];
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { rows, sales, costPricesByProductId, missingCostProductIds } = params;

  for (const sale of sales) {
    const customer = firstOrNull(sale.customer);
    const customerKey = getCustomerKeyAndName({
      customerId: sale.customer_id,
      customer,
    });
    const cogs = (sale.items ?? []).reduce((total, item) => {
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      return total + costPrice * getCustomerProfitabilityQuantity(item);
    }, 0);

    addCustomerProfitabilityEvent({
      rows,
      ...customerKey,
      revenue: getCustomerProfitabilitySaleRevenue(sale),
      cogs,
      orderId: sale.id,
    });
  }
}

function addCustomerProfitabilityPosSalesRows(params: {
  rows: Map<string, CustomerProfitabilityAccumulator>;
  posSales: CustomerProfitabilityPosSaleRow[];
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { rows, posSales, costPricesByProductId, missingCostProductIds } =
    params;

  for (const sale of posSales) {
    const customer = firstOrNull(sale.customer);
    const customerKey = getCustomerKeyAndName({
      customerId: sale.customer_id,
      customer,
    });
    const cogs = (sale.items ?? []).reduce((total, item) => {
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      return total + costPrice * getCustomerProfitabilityPosQuantity(item);
    }, 0);

    addCustomerProfitabilityEvent({
      rows,
      ...customerKey,
      revenue: getCustomerProfitabilityPosSaleRevenue(sale),
      cogs,
      orderId: sale.id,
    });
  }
}

function addCustomerProfitabilitySalesReturnRows(params: {
  rows: Map<string, CustomerProfitabilityAccumulator>;
  salesReturns: CustomerProfitabilitySalesReturnRow[];
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { rows, salesReturns, costPricesByProductId, missingCostProductIds } =
    params;

  for (const saleReturn of salesReturns) {
    const sale = firstOrNull(saleReturn.sale);
    const customer = firstOrNull(sale?.customer);
    const customerKey = getCustomerKeyAndName({
      customerId: sale?.customer_id,
      customer,
    });
    const cogs = (saleReturn.items ?? []).reduce((total, item) => {
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      return total + costPrice * getCustomerProfitabilityReturnQuantity(item);
    }, 0);

    addCustomerProfitabilityEvent({
      rows,
      ...customerKey,
      revenue: -getCustomerProfitabilityReturnRevenue(
        saleReturn.items,
        Number(saleReturn.total_amount ?? 0)
      ),
      cogs: -cogs,
    });
  }
}

function addCustomerProfitabilityPosReturnRows(params: {
  rows: Map<string, CustomerProfitabilityAccumulator>;
  posReturns: CustomerProfitabilityPosReturnRow[];
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { rows, posReturns, costPricesByProductId, missingCostProductIds } =
    params;

  for (const posReturn of posReturns) {
    const sale = firstOrNull(posReturn.sale);
    const customer = firstOrNull(sale?.customer);
    const customerKey = getCustomerKeyAndName({
      customerId: sale?.customer_id,
      customer,
    });
    const cogs = (posReturn.items ?? []).reduce((total, item) => {
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      return total + costPrice * getCustomerProfitabilityReturnQuantity(item);
    }, 0);
    const fallbackAmount = Number(
      posReturn.total_amount ??
        Number(posReturn.refund_amount ?? 0) +
          Number(posReturn.credit_note_amount ?? 0)
    );

    addCustomerProfitabilityEvent({
      rows,
      ...customerKey,
      revenue: -getCustomerProfitabilityReturnRevenue(
        posReturn.items,
        fallbackAmount
      ),
      cogs: -cogs,
    });
  }
}

export async function getCustomerProfitabilityDashboard(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<CustomerProfitabilityDashboardResponse> {
  const supabase = await createClient();
  const dateFrom = toDateOnly(startDate);
  const dateTo = toDateOnly(endDate);

  const [salesResult, posSalesResult, salesReturns, posReturns] =
    await Promise.all([
      supabase
        .from("sales_orders")
        .select(
          `
          id,
          status,
          customer_id,
          sub_total,
          total_amount,
          customer:customers(id, business_name, fantasy_name),
          items:sales_order_items(
            product_id,
            quantity,
            unit_quantity,
            subtotal
          )
        `
        )
        .eq("organization_id", organizationId)
        .gte("sale_date", dateFrom)
        .lte("sale_date", dateTo)
        .in("status", [...COMPLETED_SALES_ORDER_STATUSES])
        .neq("is_historical", true),
      supabase
        .from("pos_sales")
        .select(
          `
          id,
          status,
          customer_id,
          subtotal_amount,
          total_amount,
          customer:customers(id, business_name, fantasy_name),
          items:pos_sale_items(
            product_id,
            quantity,
            subtotal
          )
        `
        )
        .eq("organization_id", organizationId)
        .gte("sale_date", dateFrom)
        .lte("sale_date", dateTo)
        .eq("status", COMPLETED_POS_SALE_STATUS),
      fetchCustomerProfitabilitySalesReturns(
        supabase,
        organizationId,
        dateFrom,
        dateTo
      ),
      fetchCustomerProfitabilityPosReturns(
        supabase,
        organizationId,
        dateFrom,
        dateTo
      ),
    ]);

  if (salesResult.error) {
    throw new Error(
      `Failed to fetch customer profitability rows: ${salesResult.error.message}`
    );
  }

  if (posSalesResult.error) {
    throw new Error(
      `Failed to fetch customer POS profitability rows: ${posSalesResult.error.message}`
    );
  }

  const sales = (
    (salesResult.data ?? []) as CustomerProfitabilitySalesOrderRow[]
  ).filter((sale) => isCompletedSalesOrderStatus(sale.status));
  const posSales = (
    (posSalesResult.data ?? []) as CustomerProfitabilityPosSaleRow[]
  ).filter((sale) => isCompletedPosSaleStatus(sale.status));
  const costPricesByProductId = await fetchProfitabilityCostPrices(
    supabase,
    organizationId,
    getCustomerProfitabilityProductIds({
      sales,
      posSales,
      salesReturns,
      posReturns,
    })
  );
  const missingCostProductIds = new Set<string>();
  const rows = new Map<string, CustomerProfitabilityAccumulator>();

  addCustomerProfitabilitySalesRows({
    rows,
    sales,
    costPricesByProductId,
    missingCostProductIds,
  });
  addCustomerProfitabilityPosSalesRows({
    rows,
    posSales,
    costPricesByProductId,
    missingCostProductIds,
  });
  addCustomerProfitabilitySalesReturnRows({
    rows,
    salesReturns,
    costPricesByProductId,
    missingCostProductIds,
  });
  addCustomerProfitabilityPosReturnRows({
    rows,
    posReturns,
    costPricesByProductId,
    missingCostProductIds,
  });
  warnMissingProfitabilityCosts({
    organizationId,
    dateFrom,
    dateTo,
    groupBy: "CLIENT",
    missingCostProductIds,
  });

  const customers = buildCustomerProfitabilityRows(rows);
  const totalSales = toMoney(
    customers.reduce((total, customer) => total + customer.totalSales, 0)
  );
  const totalProfit = toMoney(
    customers.reduce((total, customer) => total + customer.totalProfit, 0)
  );

  return {
    kpis: {
      totalSales,
      totalProfit,
      averageMarginPercent:
        totalSales > 0 ? toMoney((totalProfit / totalSales) * 100) : 0,
      activeCustomers: customers.length,
    },
    topCustomers: customers.slice(0, 8),
    customers,
  };
}

function getProductLabel(product: ProfitabilityProduct | null) {
  return product?.name?.trim() || "Conceptos sin producto";
}

function getBrandLabel(product: ProfitabilityProduct | null) {
  return product?.brand?.trim() || "Sin marca";
}

function getProfitabilityLabel(params: {
  groupBy: ProfitabilityGroupBy;
  customer: ProfitabilityCustomer | null;
  product: ProfitabilityProduct | null;
}) {
  const { groupBy, customer, product } = params;

  if (groupBy === "CLIENT") {
    return getCustomerLabel(customer);
  }

  if (groupBy === "BRAND") {
    return getBrandLabel(product);
  }

  return getProductLabel(product);
}

function getSalesOrderCostQuantity(item: SalesOrderProfitabilityItem) {
  return Number(item.unit_quantity ?? item.quantity ?? 0);
}

function getPosSaleCostQuantity(item: PosSaleProfitabilityItem) {
  return Number(item.quantity ?? 0);
}

function addProfitabilityLine(params: {
  rows: Map<string, ProfitabilityAccumulator>;
  label: string;
  saleId: string;
  revenue: number;
  cogs: number;
}) {
  const { rows, label, saleId, revenue, cogs } = params;
  const current = rows.get(label) ?? {
    label,
    revenue: 0,
    cogs: 0,
    orderIds: new Set<string>(),
  };

  current.revenue += revenue;
  current.cogs += cogs;
  current.orderIds.add(saleId);
  rows.set(label, current);
}

async function fetchProfitabilityCostPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  productIds: string[]
) {
  const uniqueProductIds = Array.from(new Set(productIds)).filter(Boolean);

  if (uniqueProductIds.length === 0) {
    return new Map<string, number | null>();
  }

  const { data, error } = await supabase
    .from("products_with_price")
    .select("id, cost_price")
    .eq("organization_id", organizationId)
    .in("id", uniqueProductIds);

  if (error) {
    throw new Error(
      `Failed to fetch profitability cost prices: ${error.message}`
    );
  }

  return new Map(
    (data ?? [])
      .filter((row): row is { id: string; cost_price: number | null } =>
        Boolean(row.id)
      )
      .map((row) => [row.id, row.cost_price])
  );
}

function buildProfitabilityResponse(
  rows: Map<string, ProfitabilityAccumulator>
): ProfitabilityMetricsResponse {
  return Array.from(rows.values())
    .map<ProfitabilityMetric>((row) => {
      const revenue = toMoney(row.revenue);
      const cogs = toMoney(row.cogs);
      const profit = toMoney(revenue - cogs);

      return {
        label: row.label,
        revenue,
        profit,
        margin_percent: revenue > 0 ? toMoney((profit / revenue) * 100) : 0,
        order_count: row.orderIds.size,
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);
}

function getCostPrice(params: {
  productId: string | null;
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { productId, costPricesByProductId, missingCostProductIds } = params;

  if (!productId) {
    return 0;
  }

  const costPrice = costPricesByProductId.get(productId) ?? null;

  if (costPrice === null) {
    missingCostProductIds.add(productId);
  }

  return Number(costPrice ?? 0);
}

function getProfitabilityProductIds(params: {
  sales: SalesOrderProfitabilityRow[];
  posSales: PosSaleProfitabilityRow[];
}) {
  const { sales, posSales } = params;

  return [
    ...sales.flatMap((sale) =>
      (sale.items ?? [])
        .map((item) => item.product_id)
        .filter((productId): productId is string => Boolean(productId))
    ),
    ...posSales.flatMap((sale) =>
      (sale.items ?? [])
        .map((item) => item.product_id)
        .filter((productId): productId is string => Boolean(productId))
    ),
  ];
}

function addSalesOrderProfitabilityRows(params: {
  rows: Map<string, ProfitabilityAccumulator>;
  sales: SalesOrderProfitabilityRow[];
  groupBy: ProfitabilityGroupBy;
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const { rows, sales, groupBy, costPricesByProductId, missingCostProductIds } =
    params;

  for (const sale of sales) {
    const customer = firstOrNull(sale.customer);

    for (const item of sale.items ?? []) {
      const product = firstOrNull(item.product);
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      addProfitabilityLine({
        rows,
        label: getProfitabilityLabel({ groupBy, customer, product }),
        saleId: sale.id,
        revenue: Number(item.subtotal ?? 0),
        cogs: costPrice * getSalesOrderCostQuantity(item),
      });
    }
  }
}

function addPosSaleProfitabilityRows(params: {
  rows: Map<string, ProfitabilityAccumulator>;
  posSales: PosSaleProfitabilityRow[];
  groupBy: ProfitabilityGroupBy;
  costPricesByProductId: Map<string, number | null>;
  missingCostProductIds: Set<string>;
}) {
  const {
    rows,
    posSales,
    groupBy,
    costPricesByProductId,
    missingCostProductIds,
  } = params;

  for (const sale of posSales) {
    const customer = firstOrNull(sale.customer);

    for (const item of sale.items ?? []) {
      const product = firstOrNull(item.product);
      const costPrice = getCostPrice({
        productId: item.product_id,
        costPricesByProductId,
        missingCostProductIds,
      });

      addProfitabilityLine({
        rows,
        label: getProfitabilityLabel({ groupBy, customer, product }),
        saleId: sale.id,
        revenue: Number(item.subtotal ?? 0),
        cogs: costPrice * getPosSaleCostQuantity(item),
      });
    }
  }
}

function warnMissingProfitabilityCosts(params: {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  groupBy: ProfitabilityGroupBy;
  missingCostProductIds: Set<string>;
}) {
  const { missingCostProductIds, ...context } = params;

  if (missingCostProductIds.size === 0) {
    return;
  }

  console.warn("[dashboard:profitability] Products without cost price", {
    ...context,
    productIds: Array.from(missingCostProductIds),
  });
}

export async function getProfitabilityMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  groupBy: ProfitabilityGroupBy = "CLIENT"
): Promise<ProfitabilityMetricsResponse> {
  const supabase = await createClient();
  const dateFrom = toDateOnly(startDate);
  const dateTo = toDateOnly(endDate);

  const [salesResult, posSalesResult] = await Promise.all([
    supabase
      .from("sales_orders")
      .select(
        `
          id,
          status,
          customer:customers(id, business_name, fantasy_name),
          items:sales_order_items(
            product_id,
            quantity,
            unit_quantity,
            subtotal,
            product:products(id, name, brand)
          )
        `
      )
      .eq("organization_id", organizationId)
      .gte("sale_date", dateFrom)
      .lte("sale_date", dateTo)
      .neq("is_historical", true),
    supabase
      .from("pos_sales")
      .select(
        `
          id,
          status,
          customer:customers(id, business_name, fantasy_name),
          items:pos_sale_items(
            product_id,
            quantity,
            subtotal,
            product:products(id, name, brand)
          )
        `
      )
      .eq("organization_id", organizationId)
      .gte("sale_date", dateFrom)
      .lte("sale_date", dateTo),
  ]);

  if (salesResult.error) {
    throw new Error(
      `Failed to fetch sales profitability rows: ${salesResult.error.message}`
    );
  }

  if (posSalesResult.error) {
    throw new Error(
      `Failed to fetch direct sales profitability rows: ${posSalesResult.error.message}`
    );
  }

  const sales = (
    (salesResult.data ?? []) as SalesOrderProfitabilityRow[]
  ).filter((sale) => isActiveTransaction(sale.status));
  const posSales = (
    (posSalesResult.data ?? []) as PosSaleProfitabilityRow[]
  ).filter((sale) => isActiveTransaction(sale.status));

  const costPricesByProductId = await fetchProfitabilityCostPrices(
    supabase,
    organizationId,
    getProfitabilityProductIds({ sales, posSales })
  );
  const missingCostProductIds = new Set<string>();
  const rows = new Map<string, ProfitabilityAccumulator>();

  addSalesOrderProfitabilityRows({
    rows,
    sales,
    groupBy,
    costPricesByProductId,
    missingCostProductIds,
  });
  addPosSaleProfitabilityRows({
    rows,
    posSales,
    groupBy,
    costPricesByProductId,
    missingCostProductIds,
  });
  warnMissingProfitabilityCosts({
    organizationId,
    dateFrom,
    dateTo,
    groupBy,
    missingCostProductIds,
  });

  return buildProfitabilityResponse(rows);
}

export async function getCollectionsAlerts(
  organizationId: string,
  daysBeforeDue = 5
): Promise<CollectionsAlertsResponse> {
  const supabase = await createClient();

  const fiveDaysFromNow = new Date();
  fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + daysBeforeDue);
  const dueDateLimit = fiveDaysFromNow.toISOString().split("T")[0];

  const { data: receivablesData, error: receivablesError } = await supabase
    .from("accounts_receivable")
    .select(
      `
      id,
      total_amount,
      pending_balance,
      due_date,
      customer:customers(business_name, fantasy_name),
      sale:sales_orders(invoice_number)
    `
    )
    .eq("organization_id", organizationId)
    .gt("pending_balance", 0)
    .lte("due_date", dueDateLimit)
    .order("due_date", { ascending: true });

  if (receivablesError) {
    console.error(
      "Error fetching receivables alerts:",
      receivablesError.message
    );
  }

  const { data: payablesData, error: payablesError } = await supabase
    .from("accounts_payable" as never)
    .select(
      `
      id,
      total_amount,
      pending_balance,
      due_date,
      supplier:suppliers(name),
      purchase:purchase_orders(purchase_number)
    `
    )
    .eq("organization_id", organizationId)
    .gt("pending_balance", 0)
    .lte("due_date", dueDateLimit)
    .order("due_date", { ascending: true });

  if (payablesError) {
    console.error("Error fetching payables alerts:", payablesError.message);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mapReceivable = (r: Record<string, unknown>): CollectionAlertItem => {
    const customer = r.customer as
      | { business_name: string; fantasy_name: string | null }
      | undefined;
    const sale = r.sale as { invoice_number: string | null } | undefined;
    const dueDateStr = String(r.due_date ?? "").split("T")[0];
    const dueDate = new Date(dueDateStr);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: String(r.id ?? ""),
      customerName: customer?.fantasy_name || customer?.business_name || "—",
      sellerName: null,
      invoiceNumber: sale?.invoice_number ?? null,
      totalAmount: Number(r.total_amount ?? 0),
      pendingBalance: Number(r.pending_balance ?? 0),
      dueDate: dueDateStr,
      daysUntilDue,
    };
  };

  const mapPayable = (r: Record<string, unknown>): PayableAlertItem => {
    const supplier = r.supplier as { name: string } | undefined;
    const purchase = r.purchase as
      | { purchase_number: number | null }
      | undefined;
    const dueDateStr = String(r.due_date ?? "").split("T")[0];
    const dueDate = new Date(dueDateStr);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: String(r.id ?? ""),
      supplierName: supplier?.name ?? "—",
      purchaseNumber: purchase?.purchase_number ?? null,
      totalAmount: Number(r.total_amount ?? 0),
      pendingBalance: Number(r.pending_balance ?? 0),
      dueDate: dueDateStr,
      daysUntilDue,
    };
  };

  return {
    receivables: (receivablesData ?? []).map((r) =>
      mapReceivable(r as unknown as Record<string, unknown>)
    ),
    payables: (payablesData ?? []).map((r) =>
      mapPayable(r as unknown as Record<string, unknown>)
    ),
  };
}
