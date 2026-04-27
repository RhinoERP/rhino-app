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
  ControlTowerKPIsResponse,
  DashboardFilters,
  DirectSalesDashboardResponse,
  FinancialBalanceResponse,
  FinancialBreakdownResponse,
  OrderStatusBoardResponse,
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
    .lte("sale_date", dateTo);

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
    "Consumidor final"
  );
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
      .lte("sale_date", dateTo),
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
