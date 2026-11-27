import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  org: vi.fn(),
  admin: vi.fn(),
  client: vi.fn(),
}));

vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: mocks.access,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.org,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: mocks.admin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.client,
}));

import { getSellerProgress, saveSellerProgressGoal } from "./progress.service";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function setup(
  isAdmin = false,
  goalError: { message: string; code: string } | null = null
) {
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const upserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const rows: Record<string, Record<string, unknown>[]> = {
    sales_orders: [
      {
        id: "sale-ana",
        organization_id: "org",
        user_id: USER,
        customer_id: "c",
        sale_date: "2026-11-02",
        total_amount: 100,
        currency: "ARS",
        status: "CONFIRMED",
        document_type: "STANDARD",
        invoice_type: "FACTURA_B",
        invoice_number: "0001-0001",
      },
      {
        id: "sale-beto",
        organization_id: "org",
        user_id: OTHER,
        customer_id: "c",
        sale_date: "2026-11-03",
        total_amount: 999,
        currency: "ARS",
        status: "CONFIRMED",
        document_type: "STANDARD",
        invoice_type: "FACTURA_B",
        invoice_number: "0002-0001",
      },
    ],
    sales_order_items: [
      {
        id: "item-ana",
        organization_id: "org",
        sales_order_id: "sale-ana",
        product_id: "box",
        quantity: 8,
        unit_quantity: null,
        is_adjustment: false,
      },
      {
        id: "item-beto",
        organization_id: "org",
        sales_order_id: "sale-beto",
        product_id: "box",
        quantity: 12,
        unit_quantity: null,
        is_adjustment: false,
      },
    ],
    products: [
      {
        id: "box",
        organization_id: "org",
        unit_of_measure: "CAJA",
        units_per_box: 6,
      },
    ],
    sales_quote_requests: [
      {
        organization_id: "org",
        created_by: USER,
        status: "APPROVED",
        sales_order_id: "order-1",
      },
      {
        organization_id: "org",
        created_by: OTHER,
        status: "PENDING_APPROVAL",
        sales_order_id: null,
      },
    ],
    commercial_visits: [
      {
        organization_id: "org",
        seller_id: USER,
        checked_in_at: "2026-11-02",
        review_status: "confirmed",
      },
      {
        organization_id: "org",
        seller_id: OTHER,
        checked_in_at: null,
        review_status: "not_visited",
      },
    ],
    seller_progress_goals: [],
    organization_members: [
      { user_id: USER, organization_id: "org", is_active: true },
      { user_id: OTHER, organization_id: "org", is_active: true },
    ],
  };
  const from = (table: string) => {
    const conditions: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push({ table, column, value });
        conditions.push(
          (row: Record<string, unknown>) => row[column] === value
        );
        return query;
      },
      gte: () => query,
      lt: () => query,
      in: (column: string, values: unknown[]) => {
        conditions.push((row: Record<string, unknown>) =>
          values.includes(row[column])
        );
        return query;
      },
      is: () => query,
      order: () => query,
      range: async () => ({
        data: (rows[table] ?? []).filter((row) =>
          conditions.every((condition) => condition(row))
        ),
        error: table === "seller_progress_goals" ? goalError : null,
      }),
      maybeSingle: async () => ({ data: { user_id: USER }, error: null }),
      upsert: (values: Record<string, unknown>) => {
        upserts.push({ table, values });
        return { error: null };
      },
    };
    return query;
  };
  mocks.access.mockResolvedValue({
    userId: USER,
    currentUser: { name: "Ana" },
    canRead: true,
    canManage: true,
    isOrganizationAdmin: isAdmin,
  });
  mocks.org.mockResolvedValue({ id: "org" });
  mocks.client.mockResolvedValue({ from });
  mocks.admin.mockReturnValue({
    from,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              user_metadata: { full_name: id === USER ? "Ana" : "Beto" },
            },
          },
          error: null,
        }),
      },
    },
  });
  return { filters, upserts };
}

describe("acceso al progreso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza antes de consultar datos si no tiene permiso", async () => {
    mocks.access.mockResolvedValue({
      userId: USER,
      canRead: false,
      canManage: false,
      isOrganizationAdmin: false,
    });
    await expect(getSellerProgress("org")).rejects.toThrow("Sin permiso");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("filtra ventas, cotizaciones, visitas y metas al usuario autenticado", async () => {
    const { filters } = setup();
    const result = await getSellerProgress("org", "2026-11-01");
    expect(result.goalsAvailable).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].actual).toMatchObject({
      billing: 100,
      boxes: 1,
      units: 2,
      newCustomers: 1,
      visits: 1,
      sales: 1,
    });
    for (const [table, column] of [
      ["sales_orders", "user_id"],
      ["commercial_visits", "seller_id"],
      ["seller_progress_goals", "seller_id"],
    ]) {
      expect(filters).toContainEqual({ table, column, value: USER });
    }
  });

  it("solo un administrador puede guardar metas", async () => {
    setup();
    await expect(
      saveSellerProgressGoal({
        orgSlug: "org",
        month: "2026-11-01",
        sellerId: OTHER,
        targets: {
          billing: 1,
          units: 0,
          kg: 0,
          lt: 0,
          boxes: 0,
          meters: 0,
          newCustomers: 0,
          visits: 0,
          sales: 0,
        },
      })
    ).rejects.toThrow("Solo el administrador");
  });

  it("el administrador ve el equipo completo", async () => {
    const { filters } = setup(true);
    const result = await getSellerProgress("org", "2026-11-01");
    expect(result.rows.map((row) => row.sellerName)).toEqual(["Ana", "Beto"]);
    expect(result.rows.map((row) => row.actual.billing)).toEqual([100, 999]);
    expect(
      filters.some(
        (filter) =>
          filter.table === "sales_orders" && filter.column === "user_id"
      )
    ).toBe(false);
  });

  it("mantiene el avance si falta la migración de objetivos", async () => {
    setup(true, {
      code: "PGRST205",
      message:
        "Could not find the table 'public.seller_progress_goals' in the schema cache",
    });
    const result = await getSellerProgress("org");
    expect(result.goalsAvailable).toBe(false);
    expect(result.rows.map((row) => row.actual.billing)).toEqual([100, 999]);
    expect(result.rows.every((row) => row.targets.billing === 0)).toBe(true);
  });

  it("no oculta otros errores al consultar las metas", async () => {
    setup(true, { code: "42501", message: "permission denied" });
    await expect(getSellerProgress("org")).rejects.toThrow("permission denied");
  });

  it("sigue mostrando KPI si falta la nueva columna de objetivos", async () => {
    setup(true, {
      code: "42703",
      message: "column metric_targets does not exist",
    });
    const result = await getSellerProgress("org");
    expect(result.goalsAvailable).toBe(false);
    expect(result.rows[0].actual.sales).toBe(1);
  });

  it("guarda por vendedor y mes con la sesión del administrador", async () => {
    const { upserts } = setup(true);
    await saveSellerProgressGoal({
      orgSlug: "org",
      month: "2026-11-01",
      sellerId: OTHER,
      targets: {
        billing: 100,
        units: 20,
        kg: 30,
        lt: 50,
        boxes: 3,
        meters: 0,
        newCustomers: 1,
        visits: 2,
        sales: 4,
      },
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(upserts).toEqual([
      {
        table: "seller_progress_goals",
        values: expect.objectContaining({
          organization_id: "org",
          seller_id: OTHER,
          period_month: "2026-11-01",
          target_amount: 100,
          metric_targets: expect.objectContaining({
            billing: 100,
            boxes: 3,
            sales: 4,
          }),
        }),
      },
    ]);
  });
});
