/**
 * Dashboard Module Types
 * Torre de Control - Métricas operativas y financieras
 */

export type DateRangePreset = "today" | "week" | "month" | "year" | "last30";

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

// ============================================================================
// KPIs Operativos
// ============================================================================

export type OperationalKPIs = {
  sales: {
    totalAmount: number;
    totalOrders: number;
    percentageChange: number;
  };
  pendingDelivery: {
    count: number;
    percentageChange: number;
  };
  pendingReceipt: {
    count: number;
    percentageChange: number;
  };
  criticalStock: {
    count: number;
    percentageChange: number;
  };
  averageRotation: {
    value: number;
    percentageChange: number;
  };
  customers: {
    active: number;
    inactive: number;
    percentageChange: number;
  };
};

// ============================================================================
// KPIs Financieros
// ============================================================================

export type FinancialKPIs = {
  invoiced: {
    amount: number;
    percentageChange: number;
  };
  collected: {
    amount: number;
    percentageChange: number;
  };
  toCollect: {
    amount: number;
    percentageChange: number;
  };
  toPay: {
    amount: number;
    percentageChange: number;
  };
  grossMargin: {
    amount: number;
    percentage: number;
    percentageChange: number;
  };
};

// ============================================================================
// Pedidos y Ventas
// ============================================================================

export type OrdersMetrics = {
  total: number;
  delivered: number;
  pending: number;
  delayed: number;
};

export type TopClient = {
  id: string;
  name: string;
  totalAmount: number;
  orderCount: number;
};

export type TopProduct = {
  id: string;
  name: string;
  sku: string;
  unitsSold: number;
  totalAmount: number;
};

// ============================================================================
// Compras
// ============================================================================

export type PurchaseMetrics = {
  pendingReceipt: number;
  averageDelayDays: number;
};

// ============================================================================
// Stocks
// ============================================================================

export type StockStatus = "critical" | "healthy" | "slow";

export type StockMetrics = {
  critical: number; // Riesgo de quiebre
  healthy: number; // Stock justo
  slow: number; // Inmovilizado
};

export type StockProduct = {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  minimumStock: number;
  status: StockStatus;
  daysSinceLastMovement: number;
};

// ============================================================================
// Estado de Pedidos
// ============================================================================

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type OrderStatusItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: Date;
  expectedDeliveryDate?: Date;
  isDelayed: boolean;
};

// ============================================================================
// Rotación
// ============================================================================

export type RotationProduct = {
  id: string;
  name: string;
  sku: string;
  rotationRate: number; // Ventas / Stock promedio
  salesLast30Days: number;
  currentStock: number;
};

export type SlowMovingProduct = {
  id: string;
  name: string;
  sku: string;
  daysSinceLastSale: number;
  currentStock: number;
  lastSaleDate?: Date;
};

// ============================================================================
// Cuentas por Cobrar
// ============================================================================

export type AccountsReceivableMetrics = {
  total: number;
  overdue: number;
  upcoming: number;
};

export type TopDebtor = {
  customerId: string;
  customerName: string;
  totalDebt: number;
  overdueAmount: number;
  oldestInvoiceDate?: Date;
};

// ============================================================================
// Cuentas por Pagar
// ============================================================================

export type AccountsPayableProjection = {
  next7Days: number;
  next15Days: number;
  next30Days: number;
};

// ============================================================================
// Márgenes
// ============================================================================

export type MarginMetrics = {
  averageMarginPercentage: number;
  totalRevenue: number;
  totalCost: number;
};

export type ProductMargin = {
  productId: string;
  productName: string;
  sku: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercentage: number;
};

export type CustomerMargin = {
  customerId: string;
  customerName: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercentage: number;
};

// ============================================================================
// Insights
// ============================================================================

export type DashboardInsight = {
  id: string;
  type: "warning" | "success" | "info";
  message: string;
  metric?: string;
  percentageChange?: number;
};

// ============================================================================
// Dashboard Data Principal
// ============================================================================

export type DashboardData = {
  // Operativo
  operationalKPIs: OperationalKPIs;
  ordersMetrics: OrdersMetrics;
  topClients: TopClient[];
  topProducts: TopProduct[];
  purchaseMetrics: PurchaseMetrics;
  stockMetrics: StockMetrics;
  criticalStockProducts: StockProduct[];
  orderStatusItems: OrderStatusItem[];
  highRotationProducts: RotationProduct[];
  slowMovingProducts: SlowMovingProduct[];
  insights: DashboardInsight[];

  // Financiero
  financialKPIs: FinancialKPIs;
  accountsReceivable: AccountsReceivableMetrics;
  topDebtors: TopDebtor[];
  accountsPayable: AccountsPayableProjection;
  marginMetrics: MarginMetrics;
  productMargins: ProductMargin[];
  customerMargins: CustomerMargin[];
};

// ============================================================================
// Request/Response Types
// ============================================================================

export type GetDashboardDataParams = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
};

export type GetDashboardDataResult = {
  success: boolean;
  error?: string;
  data?: DashboardData;
};
