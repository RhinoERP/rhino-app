// biome-ignore lint/style/noExportedImports: re-export needed for module consumers
import type { PaginatedResult, SortParam } from "@/types/pagination";
import type { Database } from "@/types/supabase";
export type { PaginatedResult, SortParam };

export type OrderFlowStatus = Database["public"]["Enums"]["order_flow_status"];

export type OrderItemStatus = OrderFlowStatus;

export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export type OrderQuoteItemExtraRow =
  Database["public"]["Tables"]["quote_item_extras"]["Row"];

export type ChildOrderRoute = "direct" | "production" | "purchase" | "reserve";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

export type OrderStatusHistoryRow =
  Database["public"]["Tables"]["order_status_history"]["Row"];

export type OrderStatusHistoryRowWithUser = OrderStatusHistoryRow & {
  changed_by_name: string | null;
};

export type OrderDesignProduct = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  size: string;
  logo_position: string;
  logo_description: string;
  personalization_type: string[];
  colors: string;
  reflective_tape: boolean;
  reflective_tape_position: string;
  additional_notes: string;
  reference_image: string | null;
};

export type OrderDesignRow = {
  id: string;
  order_id: string;
  products: OrderDesignProduct[];
  general_notes: string | null;
  client_approved_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type OrderWithDetails = OrderRow & {
  purchase_order_file?: string | null;
  sales_order?: {
    id: string;
    sale_number: number | null;
    invoice_number: string | null;
  } | null;
  quotes: {
    id: string;
    total_amount: number;
    currency: string;
    payment_condition: string | null;
    observations: string | null;
    customers: {
      business_name: string;
      fantasy_name: string | null;
    } | null;
    quote_items: Array<{
      id: string;
      description: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
      product_id: string | null;
      product_variant_id: string | null;
      assigned_order_id: string | null;
      product_variants: { talle: string; color: string } | null;
      quote_item_extras: OrderQuoteItemExtraRow[] | null;
    }>;
  } | null;
  order_designs: OrderDesignRow | null;
};

export type ChildOrderSummary = {
  id: string;
  order_number: string;
  status: OrderFlowStatus;
  created_at: string | null;
  created_by: string | null;
  parent_order_id: string | null;
  observations: string | null;
};

export type OrderWithHistory = OrderWithDetails & {
  order_status_history: OrderStatusHistoryRowWithUser[];
  order_designs: OrderDesignRow | null;
};

export type OrderWithChildren = OrderWithDetails & {
  order_status_history: OrderStatusHistoryRowWithUser[];
  order_designs: OrderDesignRow | null;
  children: ChildOrderSummary[];
};

export type PurchasingOrder = {
  id: string;
  order_number: string;
  status: OrderFlowStatus;
  parent_order_id: string | null;
  parent_order_number: string;
  parent_customer_name: string;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    product_id: string | null;
    product_variant_id: string | null;
    quote_item_extras: OrderQuoteItemExtraRow[] | null;
  }>;
};

export type ChildOrderForDispatch = {
  id: string;
  order_number: string;
  status: OrderFlowStatus;
  parent_order_id: string;
  parent_order_number: string;
  parent_customer_name: string;
  parent_sales_order_id: string | null;
  total_amount: number;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    quote_item_extras: OrderQuoteItemExtraRow[] | null;
  }>;
};

export type ChildOrderForProduction = {
  id: string;
  order_number: string;
  status: OrderFlowStatus;
  parent_order_id: string;
  parent_order_number: string;
  parent_customer_name: string;
  created_at: string | null;
  has_boceto: boolean;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    quote_item_extras: OrderQuoteItemExtraRow[] | null;
  }>;
};

export type StatusConfig = {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  step: number;
};

export type FlowStage = {
  step: number;
  label: string;
  statuses: OrderFlowStatus[];
};

export type OrderAreaCounts = {
  finance: number;
  stock: number;
  production: number;
  dispatch: number;
  total: number;
};

export type StockInfo = {
  product_id: string;
  product_name: string;
  quantity_needed: number;
  stock_available: number;
  has_stock: boolean;
  variant_id?: string | null;
  variant_talle?: string | null;
  variant_color?: string | null;
  variant_stock?: number | null;
};

export type OrderMetrics = {
  total: number;
  inProgress: number;
  requiresAction: number;
  delivered: number;
};

export type OrdersPaginatedParams = {
  page: number;
  pageSize: number;
  search?: string;
  sort?: SortParam[];
  status?: OrderFlowStatus;
};

export type OrderPaginatedItem = {
  id: string;
  order_number: string;
  status: OrderFlowStatus;
  created_at: string | null;
  updated_at: string | null;
  purchase_order_file: string | null;
  quote_id: string | null;
  sales_order_id: string | null;
  parent_order_id: string | null;
  customer_name: string;
  currency: string;
  total_amount: number;
  payment_condition: string | null;
  items_count: number;
  children: Array<{
    id: string;
    order_number: string;
    status: OrderFlowStatus;
    created_at: string | null;
  }>;
};

export type DispatchMetrics = {
  preparing: number;
  inTransit: number;
  delivered: number;
};

export type UpdateStatusInput = {
  orgSlug: string;
  orderId: string;
  newStatus: OrderFlowStatus;
  notes?: string;
  trackingNumber?: string;
  observations?: string | null;
};

export const ORDER_STATUS_CONFIG: Record<OrderFlowStatus, StatusConfig> = {
  PENDING_FINANCE: {
    label: "Pendiente Finanzas",
    description:
      "El pedido está siendo evaluado por el área de Finanzas para aprobación.",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    step: 1,
  },
  FINANCE_REJECTED: {
    label: "Rechazado por Finanzas",
    description: "El pedido fue rechazado por el área de Finanzas.",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    step: 1,
  },
  PENDING_STOCK: {
    label: "Pendiente Stock",
    description:
      "Se está verificando la disponibilidad de stock para el pedido.",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    step: 2,
  },
  STOCK_OK: {
    label: "Stock Disponible",
    description: "Todos los productos del pedido están disponibles en stock.",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    step: 2,
  },
  PURCHASE_REQUIRED: {
    label: "Requiere Compra",
    description: "Algunos productos no están en stock y deben ser comprados.",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    step: 2,
  },
  PURCHASING: {
    label: "En Compra",
    description: "Se generó una orden de compra para los productos faltantes.",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    step: 3,
  },
  GOODS_RECEIVED: {
    label: "Mercadería Recibida",
    description: "Los productos comprados fueron recibidos y están en stock.",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
    step: 3,
  },
  STOCK_RESERVED: {
    label: "Stock Reservado",
    description:
      "Stock descontado y reservado, pendiente de envío a despacho o producción.",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    step: 2,
  },
  IN_PRODUCTION: {
    label: "En Producción",
    description: "El pedido está en proceso de producción.",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    step: 4,
  },
  DESIGN_REVIEW: {
    label: "Personalización/Bordado",
    description: "El pedido está en producción externa.",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    step: 4,
  },
  PREPARING: {
    label: "Preparando",
    description: "El pedido está siendo preparado para despacho.",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
    step: 5,
  },
  DISPATCHED: {
    label: "Despachado",
    description: "El pedido fue despachado y está en camino al cliente.",
    color: "text-sky-600",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    step: 7,
  },
  DELIVERED: {
    label: "Entregado",
    description: "El pedido fue entregado al cliente.",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    borderColor: "border-emerald-300",
    step: 8,
  },
  CANCELLED: {
    label: "Cancelado",
    description: "El pedido fue cancelado.",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
    step: 0,
  },
};

export const FLOW_STAGES: FlowStage[] = [
  {
    step: 1,
    label: "Finanzas",
    statuses: ["PENDING_FINANCE", "FINANCE_REJECTED"],
  },
  {
    step: 2,
    label: "Stock / Compras",
    statuses: [
      "PENDING_STOCK",
      "STOCK_OK",
      "STOCK_RESERVED",
      "PURCHASE_REQUIRED",
    ],
  },
  {
    step: 3,
    label: "Recepción",
    statuses: ["PURCHASING", "GOODS_RECEIVED"],
  },
  {
    step: 4,
    label: "Producción",
    statuses: ["IN_PRODUCTION", "DESIGN_REVIEW"],
  },
  {
    step: 5,
    label: "Preparación",
    statuses: ["PREPARING"],
  },
  {
    step: 6,
    label: "Despacho",
    statuses: ["DISPATCHED"],
  },
  {
    step: 7,
    label: "Entregado",
    statuses: ["DELIVERED"],
  },
];

export type SaleDispatchEventItem = {
  id: string;
  description: string;
  quantity: number;
};

export type SaleDispatchEvent = {
  remito_number: string;
  dispatched_at: string;
  child_order_number: string;
  child_order_id: string;
  child_orders: Array<{ id: string; order_number: string }>;
  notes: string | null;
  items: SaleDispatchEventItem[];
  remittance_pdf_url?: string | null;
};

export type SaleDispatchProgress = {
  total_children: number;
  dispatched_children: number;
  delivered_children: number;
  completed: boolean;
  standalone: boolean;
  events: SaleDispatchEvent[];
};

export const VALID_TRANSITIONS: Record<OrderFlowStatus, OrderFlowStatus[]> = {
  PENDING_FINANCE: ["FINANCE_REJECTED", "PENDING_STOCK", "CANCELLED"],
  FINANCE_REJECTED: [], // terminal
  PENDING_STOCK: [
    "STOCK_OK",
    "PURCHASE_REQUIRED",
    "STOCK_RESERVED",
    "CANCELLED",
  ],
  STOCK_OK: ["STOCK_RESERVED", "IN_PRODUCTION", "CANCELLED"],
  STOCK_RESERVED: ["IN_PRODUCTION", "CANCELLED"],
  PURCHASE_REQUIRED: ["PURCHASING", "CANCELLED"],
  PURCHASING: ["GOODS_RECEIVED", "CANCELLED"],
  GOODS_RECEIVED: ["IN_PRODUCTION", "PREPARING", "CANCELLED"],
  IN_PRODUCTION: ["DESIGN_REVIEW", "CANCELLED"],
  DESIGN_REVIEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [], // terminal
  CANCELLED: [], // terminal
};

const ROUTE_MARKER = /__route:\w+__\s*/;

export function stripRouteFromObservations(
  observations: string | null | undefined
): string | null {
  if (!observations) {
    return null;
  }
  return observations.replace(ROUTE_MARKER, "");
}
