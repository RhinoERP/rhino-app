// Estado completo del flujo de un pedido
export type OrderFlowStatus =
  | "PENDING_FINANCE"
  | "FINANCE_REJECTED"
  | "PENDING_STOCK"
  | "STOCK_OK"
  | "PURCHASE_REQUIRED"
  | "PURCHASING"
  | "GOODS_RECEIVED"
  | "IN_PRODUCTION"
  | "DESIGN_REVIEW"
  | "PREPARING"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";

export const VALID_TRANSITIONS: Record<OrderFlowStatus, OrderFlowStatus[]> = {
  PENDING_FINANCE: ["PENDING_STOCK", "FINANCE_REJECTED", "CANCELLED"],
  FINANCE_REJECTED: [],
  PENDING_STOCK: ["STOCK_OK", "PURCHASE_REQUIRED", "CANCELLED"],
  STOCK_OK: ["IN_PRODUCTION", "CANCELLED"],
  PURCHASE_REQUIRED: ["PURCHASING", "CANCELLED"],
  PURCHASING: ["GOODS_RECEIVED", "CANCELLED"],
  GOODS_RECEIVED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["DESIGN_REVIEW", "CANCELLED"],
  DESIGN_REVIEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export type OrderRow = {
  id: string;
  organization_id: string;
  quote_id: string;
  order_number: string;
  status: OrderFlowStatus;
  // Finance
  finance_notes: string | null;
  finance_reviewed_by: string | null;
  finance_reviewed_at: string | null;
  // Stock
  stock_notes: string | null;
  stock_checked_by: string | null;
  stock_checked_at: string | null;
  purchase_order_id: string | null;
  // Production
  production_notes: string | null;
  production_started_at: string | null;
  design_approved_at: string | null;
  // Dispatch
  dispatch_notes: string | null;
  tracking_number: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  // Meta
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export type OrderStatusHistoryRow = {
  id: string;
  order_id: string;
  from_status: OrderFlowStatus | null;
  to_status: OrderFlowStatus;
  notes: string | null;
  changed_by: string | null;
  changed_at: string | null;
};

export type OrderDesignProduct = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  size: string;
  // Personalización
  logo_position: string;
  logo_description: string;
  personalization_type: string[];
  colors: string;
  reflective_tape: boolean;
  reflective_tape_position: string;
  additional_notes: string;
  // Imagen de referencia (URL o base64)
  reference_image: string | null;
};

export type OrderDesignRow = {
  id: string;
  order_id: string;
  products: OrderDesignProduct[];
  general_notes: string | null;
  client_approved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

// Tipos enriquecidos para la UI
export type OrderWithDetails = OrderRow & {
  quotes: {
    id: string;
    total_amount: number;
    currency: string;
    payment_condition: string | null;
    customers: {
      business_name: string;
      fantasy_name: string | null;
    } | null;
    quote_items: {
      id: string;
      description: string | null;
      quantity: number;
      unit_price: number;
      subtotal: number;
      product_id: string | null;
    }[];
  } | null;
};

export type OrderWithHistory = OrderWithDetails & {
  order_status_history: OrderStatusHistoryRow[];
  order_designs: OrderDesignRow | null;
};

// Configuración visual de cada estado
export type StatusConfig = {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  step: number;
};

export const ORDER_STATUS_CONFIG: Record<OrderFlowStatus, StatusConfig> = {
  PENDING_FINANCE: {
    label: "Pendiente Finanzas",
    description: "Esperando aprobación de Administración y Finanzas",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    step: 1,
  },
  FINANCE_REJECTED: {
    label: "Rechazado por Finanzas",
    description: "El pedido no cumple los estándares de rentabilidad",
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
    step: 1,
  },
  PENDING_STOCK: {
    label: "Verificación de Stock",
    description: "Compras verificando disponibilidad de stock",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    step: 2,
  },
  STOCK_OK: {
    label: "Stock Disponible",
    description: "Stock verificado y reservado",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    step: 2,
  },
  PURCHASE_REQUIRED: {
    label: "Requiere Compra",
    description: "Falta stock — se debe generar orden de compra",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    step: 2,
  },
  PURCHASING: {
    label: "Orden de Compra Generada",
    description: "Compra en proceso con el proveedor",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    step: 3,
  },
  GOODS_RECEIVED: {
    label: "Mercadería Recibida",
    description: "Mercadería recibida en depósito",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20",
    step: 3,
  },
  IN_PRODUCTION: {
    label: "En Producción",
    description: "En proceso de diseño y personalización",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
    step: 4,
  },
  DESIGN_REVIEW: {
    label: "Boceto para Revisión",
    description: "Boceto generado — pendiente aprobación del área",
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20",
    step: 4,
  },
  PREPARING: {
    label: "Preparando Pedido",
    description: "Depósito preparando y empaquetando el pedido",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
    step: 5,
  },
  DISPATCHED: {
    label: "Despachado",
    description: "Pedido en camino al cliente",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    step: 6,
  },
  DELIVERED: {
    label: "Entregado",
    description: "Pedido entregado al cliente",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    step: 7,
  },
  CANCELLED: {
    label: "Cancelado",
    description: "Pedido cancelado",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/20",
    step: 0,
  },
};

// Etapas del flujo para el timeline
export type FlowStage = {
  step: number;
  label: string;
  statuses: OrderFlowStatus[];
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
    statuses: ["PENDING_STOCK", "STOCK_OK", "PURCHASE_REQUIRED"],
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
