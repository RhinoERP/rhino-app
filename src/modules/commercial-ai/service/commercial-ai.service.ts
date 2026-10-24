import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  addProgress,
  analyzePortfolio,
  fromDayNumber,
  monthProgressByCustomer,
  suggestedLevers,
  suggestPlan,
  toDayNumber,
} from "../engine/analysis";
import {
  type CommercialAiConfig,
  type CommercialAiEvent,
  type CommercialAiRole,
  type CommercialAiSeller,
  type CommercialAiSnapshot,
  type CommercialAiTask,
  type CustomerView,
  DEFAULT_COMMERCIAL_AI_CONFIG,
  type EngineCustomer,
  type EngineOrder,
  type EngineProduct,
  type LeverKey,
  type LeverProgress,
  type OpportunityStage,
  type OpportunityStateRow,
  type OpportunityView,
  type SellerMonthProgress,
} from "../types";

/** Estados de venta que cuentan como venta real (no preventa ni cancelada). */
const SOLD_STATUSES = ["CONFIRMED", "DISPATCH", "DELIVERED", "INCOMPLETE"];
const HISTORY_DAYS = 400;
const WHITESPACE_PATTERN = /\s+/;
const PAGE_SIZE = 1000;
const TOP_PRODUCTS = 5;
const RECENT_ORDERS = 8;
const SELLER_COLORS = [
  "#0E5C6B",
  "#7044A8",
  "#B83D2A",
  "#2A58AA",
  "#9E6508",
  "#287048",
  "#5B6B2E",
  "#8A3E6A",
];

export type CommercialAiAccess = {
  role: CommercialAiRole;
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/* ============ Acceso ============ */

export async function resolveCommercialAiAccess(
  orgSlug: string
): Promise<CommercialAiAccess | null> {
  const supabase = await createClient();
  const [{ data: auth }, permissionsResult, organization] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
    getOrganizationBySlug(orgSlug),
  ]);

  const user = auth.user;
  if (!(user && organization?.id)) {
    return null;
  }
  const permissions = (permissionsResult.data ?? []) as string[];
  const isManager =
    permissions.includes("organization.admin") ||
    permissions.includes("commercial_ai.manage");
  const isSeller = permissions.includes("commercial_ai.read");
  if (!(isManager || isSeller)) {
    return null;
  }

  return {
    role: isManager ? "gerente" : "vendedor",
    userId: user.id,
    userName:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      "Usuario",
    organizationId: organization.id,
    organizationName: organization.name,
  };
}

export async function requireCommercialAiAccess(
  orgSlug: string,
  level: "read" | "manage" = "read"
): Promise<CommercialAiAccess> {
  const access = await resolveCommercialAiAccess(orgSlug);
  if (!access) {
    throw new Error("No tenés acceso a IA Comercial");
  }
  if (level === "manage" && access.role !== "gerente") {
    throw new Error("Solo un gerente puede hacer esto");
  }
  return access;
}

/* ============ Fechas en hora argentina ============ */

export function todayInArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function daysInMonth(isoDate: string): number {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/* ============ Lectura paginada ============ */

async function fetchAll<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

/** Las tablas del módulo pueden no existir todavía si falta correr la migración. */
async function fetchOptional<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.warn(`IA Comercial: ${error.message}`);
    return [];
  }
  return data ?? [];
}

/* ============ Carga de datos ============ */

type CustomerRow = {
  id: string;
  business_name: string | null;
  fantasy_name: string | null;
  city: string | null;
  delivery_city: string | null;
  customer_channel: string | null;
  assigned_seller_id: string | null;
  phone: string | null;
  email: string | null;
  credit_limit: number | null;
};

type OrderRow = {
  id: string;
  sale_number: string | null;
  customer_id: string | null;
  sale_date: string | null;
  total_amount: number | null;
  user_id: string | null;
};

type ItemRow = {
  sales_order_id: string;
  product_id: string | null;
  quantity: number | null;
  subtotal: number | null;
  is_adjustment: boolean | null;
};

type ReceivableRow = {
  customer_id: string | null;
  pending_balance: number | null;
  due_date: string | null;
};

async function loadSalesData(
  admin: AdminClient,
  organizationId: string,
  today: string
) {
  const since = fromDayNumber(toDayNumber(today) - HISTORY_DAYS);

  const [customers, orders, products, categories, receivables] =
    await Promise.all([
      fetchAll<CustomerRow>((from, to) =>
        admin
          .from("customers")
          .select(
            "id, business_name, fantasy_name, city, delivery_city, customer_channel, assigned_seller_id, phone, email, credit_limit"
          )
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("id")
          .range(from, to)
      ),
      fetchAll<OrderRow>((from, to) =>
        admin
          .from("sales_orders")
          .select(
            "id, sale_number, customer_id, sale_date, total_amount, user_id"
          )
          .eq("organization_id", organizationId)
          .in("status", SOLD_STATUSES)
          .eq("currency", "ARS")
          .gte("sale_date", since)
          .order("id")
          .range(from, to)
      ),
      fetchAll<{
        id: string;
        name: string;
        category_id: string | null;
        unit_of_measure: string | null;
      }>((from, to) =>
        admin
          .from("products")
          .select("id, name, category_id, unit_of_measure")
          .eq("organization_id", organizationId)
          .order("id")
          .range(from, to)
      ),
      fetchAll<{ id: string; name: string }>((from, to) =>
        admin
          .from("categories")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("id")
          .range(from, to)
      ),
      fetchAll<ReceivableRow>((from, to) =>
        admin
          .from("accounts_receivable")
          .select("customer_id, pending_balance, due_date")
          .eq("organization_id", organizationId)
          .gt("pending_balance", 0)
          .order("id")
          .range(from, to)
      ),
    ]);

  const orderIds = new Set(orders.map((o) => o.id));
  const items = await fetchAll<ItemRow>((from, to) =>
    admin
      .from("sales_order_items")
      .select("sales_order_id, product_id, quantity, subtotal, is_adjustment")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("id")
      .range(from, to)
  );

  return {
    customers,
    orders,
    items: items.filter((item) => orderIds.has(item.sales_order_id)),
    products,
    categories,
    receivables,
  };
}

async function loadModuleState(
  admin: AdminClient,
  organizationId: string,
  periodMonth: string
) {
  const [settings, states, events, tasks, goals] = await Promise.all([
    fetchOptional<{ config: Partial<CommercialAiConfig> }>(
      admin
        .from("commercial_ai_settings")
        .select("config")
        .eq("organization_id", organizationId)
    ),
    fetchOptional<{
      opportunity_key: string;
      stage: OpportunityStage;
      snooze_until: string | null;
      contacted_at: string | null;
      last_touched_at: string | null;
    }>(
      admin
        .from("commercial_ai_opportunity_states")
        .select(
          "opportunity_key, stage, snooze_until, contacted_at, last_touched_at"
        )
        .eq("organization_id", organizationId)
    ),
    fetchOptional<{
      id: string;
      customer_id: string;
      opportunity_key: string | null;
      kind: CommercialAiEvent["kind"];
      body: string;
      actor_name: string | null;
      created_at: string;
    }>(
      admin
        .from("commercial_ai_events")
        .select(
          "id, customer_id, opportunity_key, kind, body, actor_name, created_at"
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    fetchOptional<{
      id: string;
      customer_id: string;
      seller_id: string | null;
      body: string;
      due_date: string;
      done_at: string | null;
    }>(
      admin
        .from("commercial_ai_tasks")
        .select("id, customer_id, seller_id, body, due_date, done_at")
        .eq("organization_id", organizationId)
        .order("due_date")
    ),
    fetchOptional<{
      seller_id: string | null;
      target_amount: number;
      levers: Partial<Record<LeverKey, number>>;
    }>(
      admin
        .from("commercial_ai_goals")
        .select("seller_id, target_amount, levers")
        .eq("organization_id", organizationId)
        .eq("period_month", periodMonth)
    ),
  ]);

  return { settings: settings[0]?.config ?? {}, states, events, tasks, goals };
}

type MemberRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_key: string | null;
  is_active: boolean;
};

async function loadMembers(orgSlug: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_organization_members_with_users",
    { org_slug_param: orgSlug }
  );
  if (error) {
    console.warn(
      `IA Comercial: no se pudieron leer miembros: ${error.message}`
    );
    return [];
  }
  return (data ?? []) as unknown as MemberRow[];
}

/* ============ Armado del snapshot ============ */

function shortName(name: string): string {
  return name.split(WHITESPACE_PATTERN)[0] ?? name;
}

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function emptyLevers(): Record<LeverKey, number> {
  return { base: 0, rec: 0, vm: 0, nue: 0 };
}

function effectiveStage(
  state: OpportunityStateRow,
  today: string
): OpportunityStage {
  if (
    state.stage === "despues" &&
    state.snoozeUntil &&
    state.snoozeUntil <= today
  ) {
    return "nueva";
  }
  return state.stage;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: arma en un solo lugar la vista completa que consume la UI
export async function getCommercialAiSnapshot(
  orgSlug: string
): Promise<CommercialAiSnapshot | null> {
  const access = await resolveCommercialAiAccess(orgSlug);
  if (!access) {
    return null;
  }

  const admin = createAdminClient();
  const today = todayInArgentina();
  const todayDay = toDayNumber(today);
  const periodMonth = monthStartOf(today);
  const monthStartDay = toDayNumber(periodMonth);

  const [sales, moduleState, members] = await Promise.all([
    loadSalesData(admin, access.organizationId, today),
    loadModuleState(admin, access.organizationId, periodMonth),
    loadMembers(orgSlug),
  ]);

  const config: CommercialAiConfig = {
    ...DEFAULT_COMMERCIAL_AI_CONFIG,
    ...moduleState.settings,
  };

  /* --- pedidos normalizados --- */
  const linesByOrder = new Map<string, EngineOrder["lines"]>();
  for (const item of sales.items) {
    if (!item.product_id || item.is_adjustment) {
      continue;
    }
    const lines = linesByOrder.get(item.sales_order_id) ?? [];
    lines.push({
      productId: item.product_id,
      quantity: Number(item.quantity ?? 0),
      amount: Number(item.subtotal ?? 0),
    });
    linesByOrder.set(item.sales_order_id, lines);
  }

  const orders: EngineOrder[] = [];
  const orderUsersByCustomer = new Map<string, (string | null)[]>();
  let latestDay: number | null = null;
  for (const order of sales.orders) {
    if (!(order.customer_id && order.sale_date)) {
      continue;
    }
    const day = toDayNumber(order.sale_date);
    if (day > todayDay) {
      continue;
    }
    latestDay = latestDay === null ? day : Math.max(latestDay, day);
    orders.push({
      id: order.id,
      number: order.sale_number,
      customerId: order.customer_id,
      day,
      total: Number(order.total_amount ?? 0),
      lines: linesByOrder.get(order.id) ?? [],
    });
    const users = orderUsersByCustomer.get(order.customer_id) ?? [];
    users.push(order.user_id);
    orderUsersByCustomer.set(order.customer_id, users);
  }

  /* --- clientes: vendedor asignado o, si no tiene, quien más le vendió --- */
  const allCustomers: EngineCustomer[] = sales.customers.map((row) => ({
    id: row.id,
    name: row.fantasy_name || row.business_name || "Cliente sin nombre",
    city: row.delivery_city || row.city,
    channel: row.customer_channel,
    sellerId:
      row.assigned_seller_id ??
      mostFrequent(orderUsersByCustomer.get(row.id) ?? []),
    phone: row.phone,
    email: row.email,
    creditLimit: row.credit_limit === null ? null : Number(row.credit_limit),
  }));

  /* --- vendedores --- */
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const sellerIds = new Set<string>();
  for (const customer of allCustomers) {
    if (customer.sellerId) {
      sellerIds.add(customer.sellerId);
    }
  }
  for (const member of members) {
    if (member.is_active && member.role_key === "vendedor") {
      sellerIds.add(member.user_id);
    }
  }
  const sellers: CommercialAiSeller[] = [...sellerIds]
    .map((id) => {
      const member = memberById.get(id);
      const name = member?.full_name || member?.email || "Vendedor";
      return { id, name, shortName: shortName(name), color: "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((seller, index) => ({
      ...seller,
      color: SELLER_COLORS[index % SELLER_COLORS.length],
    }));
  const sellerById = new Map(sellers.map((s) => [s.id, s]));

  /* --- análisis sobre toda la organización (los pares necesitan a todos) --- */
  const productMap = new Map<string, EngineProduct>(
    sales.products.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        categoryId: p.category_id,
        unit: p.unit_of_measure,
      },
    ])
  );
  const categoryMap = new Map(sales.categories.map((c) => [c.id, c.name]));
  const analysis = analyzePortfolio(
    {
      today: todayDay,
      customers: allCustomers,
      orders,
      products: productMap,
      categories: categoryMap,
      config,
    },
    {
      orgName: access.organizationName,
      sellerShortName: (sellerId) =>
        (sellerId && sellerById.get(sellerId)?.shortName) ||
        shortName(access.userName),
    }
  );

  /* --- alcance según rol --- */
  const isManager = access.role === "gerente";
  const visibleCustomers = allCustomers.filter(
    (customer) => isManager || customer.sellerId === access.userId
  );
  const visibleIds = new Set(visibleCustomers.map((c) => c.id));

  /* --- cuenta corriente --- */
  const debt = new Map<
    string,
    { pending: number; overdue: number; maxDaysLate: number }
  >();
  for (const row of sales.receivables) {
    if (!(row.customer_id && visibleIds.has(row.customer_id))) {
      continue;
    }
    const entry = debt.get(row.customer_id) ?? {
      pending: 0,
      overdue: 0,
      maxDaysLate: 0,
    };
    const balance = Number(row.pending_balance ?? 0);
    entry.pending += balance;
    if (row.due_date && row.due_date < today) {
      entry.overdue += balance;
      entry.maxDaysLate = Math.max(
        entry.maxDaysLate,
        todayDay - toDayNumber(row.due_date)
      );
    }
    debt.set(row.customer_id, entry);
  }

  /* --- vista de clientes --- */
  const ordersByCustomer = new Map<string, EngineOrder[]>();
  for (const order of orders) {
    if (!visibleIds.has(order.customerId)) {
      continue;
    }
    const list = ordersByCustomer.get(order.customerId) ?? [];
    list.push(order);
    ordersByCustomer.set(order.customerId, list);
  }

  const customers: CustomerView[] = visibleCustomers.map((customer) => {
    const customerOrders = (ordersByCustomer.get(customer.id) ?? []).sort(
      (a, b) => b.day - a.day
    );
    const productTotals = new Map<string, number>();
    for (const order of customerOrders) {
      for (const line of order.lines) {
        productTotals.set(
          line.productId,
          (productTotals.get(line.productId) ?? 0) + line.amount
        );
      }
    }
    const customerDebt = debt.get(customer.id);
    const metrics = analysis.metrics.get(customer.id) ?? {
      status: "activo" as const,
      lastDay: null,
      firstDay: null,
      daysSince: null,
      orderCount: 0,
      monthly: 0,
    };
    return {
      ...customer,
      metrics,
      pending: customerDebt?.pending ?? 0,
      overdue: customerDebt?.overdue ?? 0,
      maxDaysLate: customerDebt?.maxDaysLate ?? 0,
      topProducts: [...productTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_PRODUCTS)
        .map(([productId, amount]) => ({
          productId,
          name: productMap.get(productId)?.name ?? "Producto",
          amount,
        })),
      recentOrders: customerOrders.slice(0, RECENT_ORDERS).map((order) => ({
        id: order.id,
        number: order.number,
        date: fromDayNumber(order.day),
        total: order.total,
      })),
    };
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));

  /* --- oportunidades con su estado --- */
  const stateByKey = new Map(
    moduleState.states.map((row) => [
      row.opportunity_key,
      {
        stage: row.stage,
        snoozeUntil: row.snooze_until,
        contactedAt: row.contacted_at,
        lastTouchedAt: row.last_touched_at,
      } satisfies OpportunityStateRow,
    ])
  );
  const opportunities: OpportunityView[] = analysis.opportunities
    .filter((opportunity) => visibleIds.has(opportunity.customerId))
    .map((opportunity) => {
      const customer = customerById.get(opportunity.customerId);
      const state: OpportunityStateRow = stateByKey.get(opportunity.key) ?? {
        stage: "nueva",
        snoozeUntil: null,
        contactedAt: null,
        lastTouchedAt: null,
      };
      return {
        ...opportunity,
        customerName: customer?.name ?? "Cliente",
        customerCity: customer?.city ?? null,
        customerStatus: customer?.metrics.status ?? "activo",
        productName: opportunity.productId
          ? (productMap.get(opportunity.productId)?.name ?? null)
          : null,
        categoryName: opportunity.categoryId
          ? (categoryMap.get(opportunity.categoryId) ?? null)
          : null,
        state,
        effectiveStage: effectiveStage(state, today),
      };
    });

  /* --- avance del mes y metas --- */
  const progressBySeller = new Map<string, SellerMonthProgress>();
  const teamProgress: SellerMonthProgress = { real: 0, levers: emptyLevers() };
  const suggestedBase = new Map<string, number>();
  const allOrdersByCustomer = new Map<string, EngineOrder[]>();
  for (const order of orders) {
    const list = allOrdersByCustomer.get(order.customerId) ?? [];
    list.push(order);
    allOrdersByCustomer.set(order.customerId, list);
  }
  for (const customer of visibleCustomers) {
    const customerOrders = allOrdersByCustomer.get(customer.id) ?? [];
    const progress = monthProgressByCustomer(customerOrders, monthStartDay);
    addProgress(teamProgress, progress);
    const sellerKey = customer.sellerId ?? "sin-asignar";
    const sellerProgress = progressBySeller.get(sellerKey) ?? {
      real: 0,
      levers: emptyLevers(),
    };
    addProgress(sellerProgress, progress);
    progressBySeller.set(sellerKey, sellerProgress);
    const isDormant = analysis.metrics.get(customer.id)?.status === "dormido";
    suggestedBase.set(
      sellerKey,
      (suggestedBase.get(sellerKey) ?? 0) +
        suggestPlan({
          orders: customerOrders,
          isDormant,
          monthStart: monthStartDay,
        })
    );
  }

  const goalBySeller = new Map(
    moduleState.goals.map((goal) => [goal.seller_id ?? "equipo", goal])
  );
  const leverProgress = (
    real: Record<LeverKey, number>,
    plan: Partial<Record<LeverKey, number>>
  ): Record<LeverKey, LeverProgress> => ({
    base: { real: real.base, plan: plan.base ?? 0 },
    rec: { real: real.rec, plan: plan.rec ?? 0 },
    vm: { real: real.vm, plan: plan.vm ?? 0 },
    nue: { real: real.nue, plan: plan.nue ?? 0 },
  });

  const suggestedNext: Record<string, Record<LeverKey, number>> = {};
  for (const [sellerKey, base] of suggestedBase) {
    suggestedNext[sellerKey] = suggestedLevers(
      base,
      opportunities.filter((o) => (o.sellerId ?? "sin-asignar") === sellerKey)
    );
  }

  const planSellers = [...progressBySeller.entries()]
    .filter(([sellerKey]) => isManager || sellerKey === access.userId)
    .map(([sellerKey, progress]) => {
      const goal = goalBySeller.get(sellerKey);
      return {
        sellerId: sellerKey,
        real: progress.real,
        target: Number(goal?.target_amount ?? 0),
        levers: leverProgress(progress.levers, goal?.levers ?? {}),
      };
    });
  if (!(isManager || planSellers.length)) {
    const goal = goalBySeller.get(access.userId);
    planSellers.push({
      sellerId: access.userId,
      real: 0,
      target: Number(goal?.target_amount ?? 0),
      levers: leverProgress(emptyLevers(), goal?.levers ?? {}),
    });
  }

  const teamGoal = goalBySeller.get("equipo");
  const teamTarget =
    Number(teamGoal?.target_amount ?? 0) ||
    planSellers.reduce((acc, seller) => acc + seller.target, 0);

  /* --- tareas y eventos visibles --- */
  const events: CommercialAiEvent[] = moduleState.events
    .filter((event) => visibleIds.has(event.customer_id))
    .map((event) => ({
      id: event.id,
      customerId: event.customer_id,
      opportunityKey: event.opportunity_key,
      kind: event.kind,
      body: event.body,
      actorName: event.actor_name,
      createdAt: event.created_at,
    }));
  const tasks: CommercialAiTask[] = moduleState.tasks
    .filter((task) => visibleIds.has(task.customer_id))
    .map((task) => ({
      id: task.id,
      customerId: task.customer_id,
      sellerId: task.seller_id,
      body: task.body,
      dueDate: task.due_date,
      doneAt: task.done_at,
    }));

  return {
    orgSlug,
    orgName: access.organizationName,
    role: access.role,
    currentUserId: access.userId,
    currentUserName: access.userName,
    today,
    dataAsOf: latestDay === null ? null : fromDayNumber(latestDay),
    config,
    sellers,
    customers,
    opportunities,
    events,
    tasks,
    plan: {
      periodMonth,
      dayOfMonth: Number(today.slice(8, 10)),
      daysInMonth: daysInMonth(today),
      team: {
        real: teamProgress.real,
        target: teamTarget,
        levers: leverProgress(teamProgress.levers, teamGoal?.levers ?? {}),
      },
      sellers: planSellers,
      suggestedNext,
    },
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    stats: {
      analyzedCustomers: allCustomers.length,
      analyzedOrders: orders.length,
    },
  };
}
