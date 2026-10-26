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
  aiModel: string;
  stats: { analyzedCustomers: number; analyzedOrders: number };
  prospecting: ProspectingSnapshot;
};

/* ============ Fase 2: rutas, prospección y aprendizajes ============ */

export type VisitResult =
  | "pedido"
  | "interesado"
  | "noestaba"
  | "seguimiento"
  | "nofue";

export type ProspectStage =
  | "sin_contactar"
  | "contactado"
  | "en_conversacion"
  | "esperando_pedido"
  | "perdido"
  | "descartado";

export type CampaignStatus = "borrador" | "activa" | "pausada" | "archivada";

export type RouteFactor = "valor" | "riesgo" | "seguimiento" | "dias";

export type RouteSettings = {
  /** Máximo de paradas que recomendamos por ruta. */
  tope: number;
  /** Orden de prioridad al recomendar a quién visitar. */
  orden: RouteFactor[];
};

export const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  tope: 12,
  orden: ["valor", "riesgo", "seguimiento", "dias"],
};

export type TerritoryView = {
  id: string;
  name: string;
  places: string[];
  sellerIds: string[];
};

export type RouteStartView = {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
};

export type RouteStopView = {
  id: string;
  position: number;
  kind: "cliente" | "prospecto";
  accountId: string;
  name: string;
  city: string | null;
  address: string | null;
  reason: string;
  result: VisitResult | null;
  note: string;
  resultAt: string | null;
};

export type RouteView = {
  id: string;
  sellerId: string | null;
  date: string;
  territoryId: string | null;
  places: string[];
  startLabel: string | null;
  createdByName: string | null;
  stops: RouteStopView[];
};

export type IcpView = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  personas: string[];
  valueProposition: string;
};

export type CampaignView = {
  id: string;
  name: string;
  sellerId: string | null;
  status: CampaignStatus;
  goalCount: number | null;
  goalKind: "contactadas" | "reuniones" | "respuestas" | null;
  startDate: string;
  endDate: string | null;
  affinityMin: number;
  maxPerRun: number;
  icpId: string | null;
  persona: string | null;
  source: "lista" | "google_places";
  country: string;
  zones: string[];
  exclusions: string[];
  entryStrategy: "catalogo" | "ia";
  catalogUrl: string | null;
  ask: "responder" | "diagnostico" | "reunion" | "visita";
  channels: ("whatsapp" | "email")[];
  notes: string;
};

export type CampaignRunView = {
  id: string;
  campaignId: string;
  status: "corriendo" | "terminada" | "fallida";
  found: number;
  discarded: number;
  createdCount: number;
  usedAi: boolean;
  log: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ProspectView = {
  id: string;
  campaignId: string | null;
  sellerId: string | null;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string;
  fitScore: number;
  fitReasons: string;
  stage: ProspectStage;
  message: string;
  nextStep: string | null;
  nextStepDate: string | null;
  customerId: string | null;
  createdAt: string;
};

export type ProspectEventView = {
  id: string;
  prospectId: string;
  kind: "note" | "stage" | "visit" | "system";
  body: string;
  actorName: string | null;
  createdAt: string;
};

export type LearningView = {
  id: string;
  kind: "nota" | "patron";
  title: string;
  body: string;
  status: "activa" | "propuesta" | "descartada";
  actorName: string | null;
  createdAt: string;
};

/** Patrón calculado al vuelo sobre lo que el equipo ya decidió. */
export type LearnedPattern = {
  key: string;
  title: string;
  detail: string;
  sample: number;
};

export type ProspectingSnapshot = {
  routeSettings: RouteSettings;
  memoryOn: boolean;
  territories: TerritoryView[];
  routeStarts: RouteStartView[];
  routes: RouteView[];
  icps: IcpView[];
  campaigns: CampaignView[];
  runs: CampaignRunView[];
  prospects: ProspectView[];
  prospectEvents: ProspectEventView[];
  learnings: LearningView[];
  patterns: LearnedPattern[];
  googlePlacesEnabled: boolean;
};
