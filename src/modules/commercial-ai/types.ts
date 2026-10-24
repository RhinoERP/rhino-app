export type CommercialAiRole = "gerente" | "vendedor";

export type OpportunityType = "riesgo" | "reactivar" | "faltante" | "cross";

export type OpportunityStage =
  | "nueva"
  | "contactada"
  | "respondio"
  | "ganada"
  | "perdida"
  | "ignorada"
  | "despues";

export type CustomerStatus = "activo" | "riesgo" | "dormido";

export type CommercialAiConfig = {
  /** Días sin comprar para considerar a un cliente dormido. */
  dormDias: number;
  /** Pedidos mínimos en el historial para marcarlo dormido. */
  dormMin: number;
  dormOn: boolean;
  riesgoOn: boolean;
  /** Caída (%) de frecuencia o monto que dispara "En riesgo". */
  riesgoCaida: number;
  /** Días de la ventana reciente que se compara. */
  riesgoRec: number;
  /** Días de la ventana base contra la que se compara. */
  riesgoBase: number;
  /** Pedidos mínimos en la ventana base. */
  riesgoMin: number;
  faltOn: boolean;
  /** % de pares que compra un producto para sugerirlo como faltante. */
  faltPct: number;
  crossOn: boolean;
  /** % de pares que compra una categoría para sugerir cross-sell. */
  crossPct: number;
  /** Antigüedad mínima (días) del cliente para sugerir cross-sell. */
  crossAnt: number;
  /** Ventana (días) de compras recientes para comparar con pares. */
  ventana: number;
  /** Historia (días) para saber si alguna vez compró algo. */
  historia: number;
  /** Mínimo de pares del mismo canal; si no, compara con toda la cartera. */
  minPares: number;
  /** Máximo de oportunidades por cliente. */
  maxOpps: number;
};

export const DEFAULT_COMMERCIAL_AI_CONFIG: CommercialAiConfig = {
  dormDias: 60,
  dormMin: 2,
  dormOn: true,
  riesgoOn: true,
  riesgoCaida: 40,
  riesgoRec: 45,
  riesgoBase: 120,
  riesgoMin: 4,
  faltOn: true,
  faltPct: 65,
  crossOn: true,
  crossPct: 65,
  crossAnt: 120,
  ventana: 90,
  historia: 180,
  minPares: 5,
  maxOpps: 3,
};

/* ---------- Datos de entrada del motor (ya normalizados desde Supabase) ---------- */

export type EngineCustomer = {
  id: string;
  name: string;
  city: string | null;
  channel: string | null;
  sellerId: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number | null;
};

export type EngineOrderLine = {
  productId: string;
  quantity: number;
  amount: number;
};

export type EngineOrder = {
  id: string;
  number: string | null;
  customerId: string;
  /** Día (entero, días desde epoch UTC). */
  day: number;
  total: number;
  lines: EngineOrderLine[];
};

export type EngineProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  unit: string | null;
};

export type EngineInput = {
  today: number;
  customers: EngineCustomer[];
  orders: EngineOrder[];
  products: Map<string, EngineProduct>;
  categories: Map<string, string>;
  config: CommercialAiConfig;
};

/* ---------- Salida del motor ---------- */

export type CustomerMetrics = {
  status: CustomerStatus;
  lastDay: number | null;
  firstDay: number | null;
  daysSince: number | null;
  orderCount: number;
  /** Compra mensual promedio de los últimos `ventana` días. */
  monthly: number;
};

export type OpportunityStrategy = {
  con: string;
  porque: string;
  ofrecer: string;
  canal: "Visita" | "WhatsApp" | "Llamada";
};

export type Opportunity = {
  key: string;
  customerId: string;
  sellerId: string | null;
  type: OpportunityType;
  productId: string | null;
  categoryId: string | null;
  /** Valor mensual estimado en pesos. */
  value: number;
  evidence: string;
  evidenceShort: string;
  strategy: OpportunityStrategy;
  message: string;
};

export type LeverKey = "base" | "rec" | "vm" | "nue";

export type LeverProgress = { real: number; plan: number };

export type SellerMonthProgress = {
  real: number;
  levers: Record<LeverKey, number>;
};

/* ---------- Lo que recibe la UI ---------- */

export type OpportunityStateRow = {
  stage: OpportunityStage;
  snoozeUntil: string | null;
  contactedAt: string | null;
  lastTouchedAt: string | null;
};

export type CommercialAiEvent = {
  id: string;
  customerId: string;
  opportunityKey: string | null;
  kind: "note" | "stage" | "preventa" | "task";
  body: string;
  actorName: string | null;
  createdAt: string;
};

export type CommercialAiTask = {
  id: string;
  customerId: string;
  sellerId: string | null;
  body: string;
  dueDate: string;
  doneAt: string | null;
};

export type CommercialAiSeller = {
  id: string;
  name: string;
  shortName: string;
  color: string;
};

export type CustomerView = EngineCustomer & {
  metrics: CustomerMetrics;
  overdue: number;
  pending: number;
  maxDaysLate: number;
  topProducts: { productId: string; name: string; amount: number }[];
  recentOrders: {
    id: string;
    number: string | null;
    date: string;
    total: number;
  }[];
};

export type OpportunityView = Opportunity & {
  customerName: string;
  customerCity: string | null;
  customerStatus: CustomerStatus;
  productName: string | null;
  categoryName: string | null;
  state: OpportunityStateRow;
  /** Etapa efectiva (una "para después" vencida vuelve a "nueva"). */
  effectiveStage: OpportunityStage;
};

export type GoalView = {
  sellerId: string | null;
  target: number;
  levers: Partial<Record<LeverKey, number>>;
};

export type MonthPlanView = {
  periodMonth: string;
  dayOfMonth: number;
  daysInMonth: number;
  team: {
    real: number;
    target: number;
    levers: Record<LeverKey, LeverProgress>;
  };
  sellers: {
    sellerId: string;
    real: number;
    target: number;
    levers: Record<LeverKey, LeverProgress>;
  }[];
  /** Sugerencia de meta del mes siguiente, calculada desde la cartera. */
  suggestedNext: Record<string, Record<LeverKey, number>>;
};

export type CommercialAiSnapshot = {
  orgSlug: string;
  orgName: string;
  role: CommercialAiRole;
  currentUserId: string;
  currentUserName: string;
  today: string;
  dataAsOf: string | null;
  config: CommercialAiConfig;
  sellers: CommercialAiSeller[];
  customers: CustomerView[];
  opportunities: OpportunityView[];
  events: CommercialAiEvent[];
  tasks: CommercialAiTask[];
  plan: MonthPlanView;
  aiEnabled: boolean;
  stats: { analyzedCustomers: number; analyzedOrders: number };
};
