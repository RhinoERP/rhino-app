import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { readSaleDocumentRate } from "@/modules/sales/document-exchange-rate";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import {
  emptyKpis,
  isSoldOrder,
  type KpiValues,
  monthlySellerKpis,
  quantityKpis,
  type SaleFact,
} from "./progress";

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const ID_BATCH = 200;

type Row = Record<string, unknown>;
type ProgressMember = { id: string; name: string };
export type SellerProgressRow = {
  sellerId: string;
  sellerName: string;
  actual: KpiValues;
  targets: KpiValues;
};
export type SellerProgressSnapshot = {
  month: string;
  currentMonth: string;
  isAdmin: boolean;
  goalsAvailable: boolean;
  rows: SellerProgressRow[];
};

/** El paginado nunca debe presentar como completo un avance truncado. */
async function pages(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: Row[] | null;
    error: { message: string; code?: string } | null;
  }>
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new ProgressQueryError(error.message, error.code);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
  throw new Error("Hay demasiados registros para calcular el avance completo.");
}

class ProgressQueryError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function isMissingGoalsTable(error: unknown): boolean {
  return (
    error instanceof ProgressQueryError &&
    (error.code === "PGRST205" || error.code === "42P01")
  );
}

function todayInArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

function asAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function goalMetrics(value: unknown): KpiValues {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    billing: asAmount(record.billing),
    units: asAmount(record.units),
    kg: asAmount(record.kg),
    lt: asAmount(record.lt),
    boxes: asAmount(record.boxes),
    meters: asAmount(record.meters),
    newCustomers: asAmount(record.newCustomers),
    visits: asAmount(record.visits),
    sales: asAmount(record.sales),
  };
}

function toArs(row: Row): number {
  const total = asAmount(row.total_amount);
  if (row.currency === "USD") {
    const rate = readSaleDocumentRate({
      arca_status: typeof row.arca_status === "string" ? row.arca_status : null,
      invoice_type:
        typeof row.invoice_type === "string" ? row.invoice_type : null,
      invoice_number:
        typeof row.invoice_number === "string" ? row.invoice_number : null,
      arca_request_json: row.arca_request_json,
      exchange_rate: asAmount(row.exchange_rate),
      commercial_exchange_rate: asAmount(row.commercial_exchange_rate),
    });
    return rate !== null && rate > 0 ? total * rate : total;
  }
  return total;
}

function nextMonthOf(month: string): string {
  const next = new Date(`${month}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
}

function allowedMonth(month: string): boolean {
  const current = `${todayInArgentina().slice(0, 7)}-01`;
  return month === current || month === nextMonthOf(current);
}

async function activeMembers(
  db: SupabaseClient,
  organizationId: string
): Promise<ProgressMember[]> {
  const members = await pages((from, to) =>
    db
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("disabled_at", null)
      .order("user_id")
      .range(from, to)
  );
  // No depender del RPC de nombres, que puede estar restringido para usuarios no admin.
  return Promise.all(
    members.map(async (member) => {
      const id = String(member.user_id);
      const { data, error } = await db.auth.admin.getUserById(id);
      if (error) {
        throw new Error(error.message);
      }
      return {
        id,
        name: String(
          data.user?.user_metadata?.full_name || data.user?.email || "Usuario"
        ),
      };
    })
  );
}

export class SellerProgressAccessError extends Error {}

async function readGoals({
  db,
  organizationId,
  month,
  userId,
  isAdmin,
}: {
  db: SupabaseClient;
  organizationId: string;
  month: string;
  userId: string;
  isAdmin: boolean;
}): Promise<{ rows: Row[]; available: boolean }> {
  try {
    const rows = await pages((from, to) => {
      let query = db
        .from("seller_progress_goals")
        .select("id, seller_id, metric_targets")
        .eq("organization_id", organizationId)
        .eq("period_month", month);
      if (!isAdmin) {
        query = query.eq("seller_id", userId);
      }
      return query.order("id").range(from, to);
    });
    return { rows, available: true };
  } catch (error) {
    if (
      isMissingGoalsTable(error) ||
      (error instanceof ProgressQueryError &&
        (error.code === "42703" || error.code === "PGRST204"))
    ) {
      return { rows: [], available: false };
    }
    throw error;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: paginates tenant-scoped sale items and catalog units before classifying every measure
async function loadSoldQuantities(
  db: SupabaseClient,
  organizationId: string,
  sales: SaleFact[],
  month: string
): Promise<
  Map<string, Pick<KpiValues, "units" | "kg" | "lt" | "boxes" | "meters">>
> {
  const current = sales.filter(
    (sale) => isSoldOrder(sale) && sale.date.slice(0, 7) === month.slice(0, 7)
  );
  const sellerBySale = new Map(current.map((sale) => [sale.id, sale.sellerId]));
  const items: Row[] = [];
  for (let index = 0; index < current.length; index += ID_BATCH) {
    const ids = current.slice(index, index + ID_BATCH).map((sale) => sale.id);
    items.push(
      ...(await pages((from, to) =>
        db
          .from("sales_order_items")
          .select(
            "id, sales_order_id, product_id, quantity, unit_quantity, is_adjustment"
          )
          .eq("organization_id", organizationId)
          .in("sales_order_id", ids)
          .order("id")
          .range(from, to)
      ))
    );
    if (items.length > MAX_ROWS) {
      throw new Error(
        "Hay demasiados artículos para calcular el avance completo."
      );
    }
  }
  const productIds = [
    ...new Set(
      items.flatMap((item) =>
        item.product_id ? [String(item.product_id)] : []
      )
    ),
  ];
  const products: Row[] = [];
  for (let index = 0; index < productIds.length; index += ID_BATCH) {
    products.push(
      ...(await pages((from, to) =>
        db
          .from("products")
          .select("id, unit_of_measure, units_per_box")
          .eq("organization_id", organizationId)
          .in("id", productIds.slice(index, index + ID_BATCH))
          .order("id")
          .range(from, to)
      ))
    );
  }
  const productById = new Map(
    products.map((product) => [String(product.id), product])
  );
  const bySeller = new Map<
    string,
    Pick<KpiValues, "units" | "kg" | "lt" | "boxes" | "meters">
  >();
  for (const item of items) {
    const sellerId = sellerBySale.get(String(item.sales_order_id));
    if (!sellerId || item.is_adjustment || !item.product_id) {
      continue;
    }
    const product = productById.get(String(item.product_id));
    if (!product) {
      throw new Error(
        "No se pudo identificar la unidad de un producto vendido."
      );
    }
    const quantity = quantityKpis({
      quantity: asAmount(item.quantity),
      unitQuantity:
        item.unit_quantity === null ? null : asAmount(item.unit_quantity),
      unitOfMeasure: String(product.unit_of_measure),
      unitsPerBox:
        product.units_per_box === null ? null : asAmount(product.units_per_box),
    });
    const totals = bySeller.get(sellerId) ?? {
      units: 0,
      kg: 0,
      lt: 0,
      boxes: 0,
      meters: 0,
    };
    for (const key of ["units", "kg", "lt", "boxes", "meters"] as const) {
      totals[key] += quantity[key];
    }
    bySeller.set(sellerId, totals);
  }
  return bySeller;
}

export async function getSellerProgress(
  orgSlug: string,
  requestedMonth?: string
): Promise<SellerProgressSnapshot> {
  const access = await getSalesAccessContext(orgSlug);
  if (
    !(
      access.userId &&
      (access.canRead || access.canManage || access.isOrganizationAdmin)
    )
  ) {
    throw new SellerProgressAccessError(
      "Sin permiso para ver el progreso comercial."
    );
  }
  const db = createAdminClient() as unknown as SupabaseClient;
  const session = await createClient();
  const organization = await getOrganizationBySlug(orgSlug, session);
  if (!organization?.id) {
    throw new Error("Organización no encontrada.");
  }
  const { data: membership, error: membershipError } = await session
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organization.id)
    .eq("user_id", access.userId)
    .eq("is_active", true)
    .is("disabled_at", null)
    .maybeSingle();
  if (membershipError || !membership) {
    throw new SellerProgressAccessError("Sin membresía activa.");
  }

  const currentMonth = `${todayInArgentina().slice(0, 7)}-01`;
  const month =
    requestedMonth && allowedMonth(requestedMonth)
      ? requestedMonth
      : currentMonth;
  const until = nextMonthOf(month);
  const isAdmin = access.isOrganizationAdmin;
  const [members, sales, visits, goalResult] = await Promise.all([
    isAdmin
      ? activeMembers(db, organization.id)
      : [
          {
            id: access.userId,
            name:
              access.currentUser?.name ||
              access.currentUser?.email ||
              "Mi avance",
          },
        ],
    pages((from, to) => {
      let query = db
        .from("sales_orders")
        .select(
          "id, customer_id, user_id, sale_date, status, document_type, total_amount, currency, exchange_rate, commercial_exchange_rate, arca_request_json, invoice_type, invoice_number, arca_status, arca_authorized_at"
        )
        .eq("organization_id", organization.id)
        .lt("sale_date", until);
      if (!isAdmin) {
        query = query.eq("user_id", access.userId);
      }
      return query.order("id").range(from, to);
    }),
    pages((from, to) => {
      let query = db
        .from("commercial_visits")
        .select("id, seller_id, checked_in_at, review_status")
        .eq("organization_id", organization.id)
        .gte("visit_date", month)
        .lt("visit_date", until);
      if (!isAdmin) {
        query = query.eq("seller_id", access.userId);
      }
      return query.order("id").range(from, to);
    }),
    readGoals({
      db,
      organizationId: organization.id,
      month,
      userId: access.userId,
      isAdmin,
    }),
  ]);

  const facts: SaleFact[] = sales
    .filter((row) => row.user_id)
    .map((row) => ({
      id: String(row.id),
      sellerId: String(row.user_id),
      customerId: row.customer_id ? String(row.customer_id) : null,
      date: String(row.sale_date),
      status: String(row.status),
      documentType: String(row.document_type),
      amount: toArs(row),
      invoiceType: row.invoice_type ? String(row.invoice_type) : null,
      invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
      arcaStatus: row.arca_status ? String(row.arca_status) : null,
      authorizedAt: row.arca_authorized_at
        ? String(row.arca_authorized_at)
        : null,
    }));
  const progress = monthlySellerKpis(facts, month);
  const quantities = await loadSoldQuantities(
    db,
    organization.id,
    facts,
    month
  );
  const goalBySeller = new Map(
    goalResult.rows.map((goal) => [String(goal.seller_id), goal])
  );
  const rows = members.map(({ id, name }): SellerProgressRow => {
    const goal = goalBySeller.get(id);
    const actual = {
      ...(progress.get(id) ?? emptyKpis()),
      ...(quantities.get(id) ?? {}),
      visits: visits.filter(
        (visit) => visit.seller_id === id && visit.checked_in_at
      ).length,
    };
    return {
      sellerId: id,
      sellerName: name,
      actual,
      targets: goalMetrics(goal?.metric_targets),
    };
  });
  return {
    month,
    currentMonth,
    isAdmin,
    goalsAvailable: goalResult.available,
    rows,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates nine metric targets and active memberships before the RLS-protected write
export async function saveSellerProgressGoal(input: {
  orgSlug: string;
  sellerId: string;
  month: string;
  targets: KpiValues;
}): Promise<void> {
  const access = await getSalesAccessContext(input.orgSlug);
  if (!(access.isOrganizationAdmin && access.userId)) {
    throw new Error("Solo el administrador puede definir metas.");
  }
  if (!allowedMonth(input.month)) {
    throw new Error("Período inválido.");
  }
  const values = (
    [
      "billing",
      "units",
      "kg",
      "lt",
      "boxes",
      "meters",
      "newCustomers",
      "visits",
      "sales",
    ] as const
  ).map((key) => input.targets?.[key]);
  if (
    values.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1_000_000_000_000
    )
  ) {
    throw new Error("Los importes de las metas deben ser válidos.");
  }
  if (
    (["units", "boxes", "newCustomers", "visits", "sales"] as const).some(
      (key) => !Number.isSafeInteger(input.targets[key])
    )
  ) {
    throw new Error(
      "Las metas de unidades y conteos deben ser números enteros."
    );
  }
  const session = await createClient();
  const organization = await getOrganizationBySlug(input.orgSlug, session);
  if (!organization?.id) {
    throw new Error("Organización no encontrada.");
  }
  const { data: actor, error: actorError } = await session
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organization.id)
    .eq("user_id", access.userId)
    .eq("is_active", true)
    .is("disabled_at", null)
    .maybeSingle();
  if (actorError || !actor) {
    throw new Error("Sin membresía activa.");
  }
  const { data: member, error: memberError } = await session
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organization.id)
    .eq("user_id", input.sellerId)
    .eq("is_active", true)
    .is("disabled_at", null)
    .maybeSingle();
  if (memberError || !member) {
    throw new Error("Vendedor inválido.");
  }
  // La escritura usa la sesión del administrador para que RLS verifique el
  // permiso al momento del upsert, incluso si cambió desde la primera lectura.
  const { error } = await (session as unknown as SupabaseClient)
    .from("seller_progress_goals")
    .upsert(
      {
        organization_id: organization.id,
        seller_id: input.sellerId,
        period_month: input.month,
        target_amount: input.targets.billing,
        metric_targets: Object.fromEntries(
          (
            [
              "billing",
              "units",
              "kg",
              "lt",
              "boxes",
              "meters",
              "newCustomers",
              "visits",
              "sales",
            ] as const
          ).map((key) => [key, input.targets[key]])
        ),
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,seller_id,period_month" }
    );
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error(
        "Falta aplicar la migración 20261127160000_seller_progress_goals.sql para guardar objetivos."
      );
    }
    if (error.code === "PGRST204" || error.code === "42703") {
      throw new Error(
        "Falta aplicar la migración 20261127170000_seller_progress_kpi_targets.sql para guardar objetivos."
      );
    }
    throw new Error(error.message);
  }
}
