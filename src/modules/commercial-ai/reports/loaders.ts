import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { agingBucket, type FactRow } from "./aggregate";
import type { DateRange } from "./periods";

/**
 * Generador de reportes · lectura de datos. Cada fuente devuelve filas planas
 * con los nombres ya resueltos (cliente, producto, vendedor…), listas para
 * agrupar. Siempre filtradas por organización y, para un vendedor, por su
 * cartera.
 */

export type LoaderContext = {
  /** Lectura de datos (clave de servicio: siempre filtrar por organización). */
  db: SupabaseClient;
  /** Con la sesión del usuario, para lo que depende de quién pregunta. */
  userDb: SupabaseClient;
  organizationId: string;
  orgSlug: string;
  today: string;
  /** Vendedor: solo sus clientes y sus ventas. */
  restrictToUserId: string | null;
};

export type LoadResult = {
  rows: FactRow[];
  truncated: boolean;
  notes: string[];
};

const PAGE_SIZE = 1000;
export const MAX_ROWS = 60_000;
const SOLD_STATUSES = ["CONFIRMED", "DISPATCH", "DELIVERED", "INCOMPLETE"];
const PURCHASE_STATUSES = [
  "ORDERED",
  "IN_TRANSIT",
  "RECEIVED",
  "PARTIALLY_RECEIVED",
];
const DAY = 10;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

async function fetchAll<T>(
  build: (from: number, to: number) => Page<T>
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

/* ============ Nombres (clientes, productos, vendedores…) ============ */

type CustomerInfo = {
  name: string;
  sellerId: string | null;
  channel: string | null;
  city: string | null;
  province: string | null;
  taxCondition: string | null;
};

type ProductInfo = {
  name: string;
  brand: string | null;
  category: string | null;
  supplier: string | null;
  unit: string | null;
  sku: string | null;
};

class Lookups {
  private customers?: Promise<Map<string, CustomerInfo>>;
  private products?: Promise<Map<string, ProductInfo>>;
  private suppliers?: Promise<Map<string, string>>;
  private members?: Promise<Map<string, string>>;
  private warehouses?: Promise<Map<string, string>>;

  private readonly ctx: LoaderContext;

  constructor(ctx: LoaderContext) {
    this.ctx = ctx;
  }

  customerMap() {
    this.customers ??= this.loadCustomers();
    return this.customers;
  }

  productMap() {
    this.products ??= this.loadProducts();
    return this.products;
  }

  supplierMap() {
    this.suppliers ??= this.simpleMap("suppliers", "name");
    return this.suppliers;
  }

  warehouseMap() {
    this.warehouses ??= this.simpleMap("warehouses", "name");
    return this.warehouses;
  }

  memberMap() {
    this.members ??= this.loadMembers();
    return this.members;
  }

  private async simpleMap(table: string, field: string) {
    const { rows } = await fetchAll<Record<string, string>>((from, to) =>
      this.ctx.db
        .from(table)
        .select(`id, ${field}` as "*")
        .eq("organization_id", this.ctx.organizationId)
        .order("id")
        .range(from, to)
    );
    return new Map(rows.map((r) => [r.id, r[field]]));
  }

  private async loadCustomers() {
    const { rows } = await fetchAll<{
      id: string;
      business_name: string | null;
      fantasy_name: string | null;
      assigned_seller_id: string | null;
      customer_channel: string | null;
      city: string | null;
      delivery_city: string | null;
      province: string | null;
      tax_condition: string | null;
    }>((from, to) =>
      this.ctx.db
        .from("customers")
        .select(
          "id, business_name, fantasy_name, assigned_seller_id, customer_channel, city, delivery_city, province, tax_condition"
        )
        .eq("organization_id", this.ctx.organizationId)
        .order("id")
        .range(from, to)
    );
    return new Map(
      rows.map((c) => [
        c.id,
        {
          name: c.fantasy_name || c.business_name || "Sin nombre",
          sellerId: c.assigned_seller_id,
          channel: c.customer_channel,
          city: (c.delivery_city || c.city || "").trim() || null,
          province: c.province,
          taxCondition: c.tax_condition,
        },
      ])
    );
  }

  private async loadProducts() {
    const [{ rows }, categories, suppliers] = await Promise.all([
      fetchAll<{
        id: string;
        name: string;
        brand: string | null;
        category_id: string | null;
        supplier_id: string | null;
        unit_of_measure: string | null;
        sku: string | null;
      }>((from, to) =>
        this.ctx.db
          .from("products")
          .select(
            "id, name, brand, category_id, supplier_id, unit_of_measure, sku"
          )
          .eq("organization_id", this.ctx.organizationId)
          .order("id")
          .range(from, to)
      ),
      this.simpleMap("categories", "name"),
      this.supplierMap(),
    ]);
    return new Map(
      rows.map((p) => [
        p.id,
        {
          name: p.name,
          brand: p.brand?.trim() || null,
          category: p.category_id
            ? (categories.get(p.category_id) ?? null)
            : null,
          supplier: p.supplier_id
            ? (suppliers.get(p.supplier_id) ?? null)
            : null,
          unit: p.unit_of_measure,
          sku: p.sku,
        },
      ])
    );
  }

  private async loadMembers() {
    const { data } = await this.ctx.userDb.rpc(
      "get_organization_members_with_users",
      {
        org_slug_param: this.ctx.orgSlug,
      }
    );
    const rows = (data ?? []) as unknown as {
      user_id: string;
      full_name: string | null;
      email: string | null;
    }[];
    return new Map(
      rows.map((m) => [m.user_id, m.full_name || m.email || "Usuario"])
    );
  }
}

function customerFields(
  info: CustomerInfo | undefined,
  members: Map<string, string>,
  customerId: string | null
) {
  return {
    cliente_id: customerId,
    cliente: info?.name ?? null,
    vendedor: info?.sellerId
      ? (members.get(info.sellerId) ?? "Sin asignar")
      : "Sin asignar",
    canal: info?.channel ?? null,
    localidad: info?.city ?? null,
    provincia: info?.province ?? null,
  };
}

function productFields(
  info: ProductInfo | undefined,
  productId: string | null
) {
  return {
    producto_id: productId,
    producto: info?.name ?? null,
    marca: info?.brand ?? null,
    categoria: info?.category ?? null,
    proveedor: info?.supplier ?? null,
  };
}

/** Pasa a pesos lo que está en otra moneda (si hay cotización). */
function toArs(
  amount: unknown,
  currency: string | null,
  rate: unknown
): number {
  const value = Number(amount) || 0;
  if (!currency || currency === "ARS") {
    return value;
  }
  const r = Number(rate);
  return r > 0 ? value * r : value;
}

function ownedBy(
  ctx: LoaderContext,
  customer: CustomerInfo | undefined,
  createdBy?: string | null
): boolean {
  if (!ctx.restrictToUserId) {
    return true;
  }
  return (
    customer?.sellerId === ctx.restrictToUserId ||
    createdBy === ctx.restrictToUserId
  );
}

const COMPROBANTE: Record<string, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
  FACTURA_A_RETENCION: "Factura A",
  NOTA_DE_VENTA: "Nota de venta (sin factura)",
};

const STATUS_TEXT: Record<string, string> = {
  CONFIRMED: "Confirmada",
  DISPATCH: "Despachada",
  DELIVERED: "Entregada",
  INCOMPLETE: "Incompleta",
  ORDERED: "Pedida",
  IN_TRANSIT: "En tránsito",
  RECEIVED: "Recibida",
  PARTIALLY_RECEIVED: "Recibida en parte",
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Pagada en parte",
  OVERDUE: "Vencida",
};

/* ============ Fuentes ============ */

type Loader = (
  ctx: LoaderContext,
  lookups: Lookups,
  range: DateRange
) => Promise<LoadResult>;

const loadVentas: Loader = async (ctx, lookups, range) => {
  const [orders, customers, members, warehouses] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("sales_orders")
        .select(
          "id, customer_id, user_id, sale_date, status, currency, exchange_rate, total_amount, sub_total, total_tax_amount, global_discount_amount, invoice_type, warehouse_id"
        )
        .eq("organization_id", ctx.organizationId)
        .in("status", SOLD_STATUSES)
        .gte("sale_date", range.from)
        .lte("sale_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.customerMap(),
    lookups.memberMap(),
    lookups.warehouseMap(),
  ]);
  const rows: FactRow[] = [];
  for (const o of orders.rows) {
    const customer = customers.get(String(o.customer_id));
    if (!ownedBy(ctx, customer, o.user_id as string)) {
      continue;
    }
    const currency = o.currency as string;
    const rate = o.exchange_rate;
    rows.push({
      fecha: String(o.sale_date).slice(0, DAY),
      ...customerFields(customer, members, o.customer_id as string),
      condicion_iva: customer?.taxCondition ?? null,
      comprobante:
        COMPROBANTE[String(o.invoice_type)] ?? (o.invoice_type as string),
      deposito: warehouses.get(String(o.warehouse_id)) ?? null,
      estado: STATUS_TEXT[String(o.status)] ?? (o.status as string),
      total: toArs(o.total_amount, currency, rate),
      neto: toArs(o.sub_total ?? o.total_amount, currency, rate),
      impuestos: toArs(o.total_tax_amount, currency, rate),
      descuento: toArs(o.global_discount_amount, currency, rate),
    });
  }
  return { rows, truncated: orders.truncated, notes: [] };
};

const loadVentasProductos: Loader = async (ctx, lookups, range) => {
  const [items, customers, products, members, warehouses] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("sales_order_items")
        .select(
          "id, sales_order_id, product_id, quantity, unit_quantity, subtotal, discount_amount, is_adjustment, sales_orders!inner(sale_date, customer_id, user_id, status, currency, exchange_rate, warehouse_id)"
        )
        .eq("organization_id", ctx.organizationId)
        .in("sales_orders.status", SOLD_STATUSES)
        .gte("sales_orders.sale_date", range.from)
        .lte("sales_orders.sale_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.customerMap(),
    lookups.productMap(),
    lookups.memberMap(),
    lookups.warehouseMap(),
  ]);
  const rows: FactRow[] = [];
  for (const item of items.rows) {
    if (item.is_adjustment) {
      continue;
    }
    const order = item.sales_orders as Record<string, unknown>;
    const customer = customers.get(String(order.customer_id));
    if (!ownedBy(ctx, customer, order.user_id as string)) {
      continue;
    }
    const product = products.get(String(item.product_id));
    const byMeasure = product?.unit === "KG" || product?.unit === "LT";
    const currency = order.currency as string;
    rows.push({
      fecha: String(order.sale_date).slice(0, DAY),
      venta_id: item.sales_order_id as string,
      ...productFields(product, item.product_id as string),
      ...customerFields(customer, members, order.customer_id as string),
      deposito: warehouses.get(String(order.warehouse_id)) ?? null,
      importe: toArs(item.subtotal, currency, order.exchange_rate),
      unidades: Number(item.quantity) || 0,
      kilos: byMeasure ? Number(item.unit_quantity ?? item.quantity) || 0 : 0,
      descuento: toArs(item.discount_amount, currency, order.exchange_rate),
    });
  }
  return { rows, truncated: items.truncated, notes: [] };
};

const loadNotasCredito: Loader = async (ctx, lookups, range) => {
  const [notes, customers, members] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("credit_notes")
        .select(
          "id, customer_id, created_by, issue_date, amount, currency, reason, origin_type, status"
        )
        .eq("organization_id", ctx.organizationId)
        .gte("issue_date", range.from)
        .lte("issue_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.customerMap(),
    lookups.memberMap(),
  ]);
  const rows: FactRow[] = [];
  for (const n of notes.rows) {
    const status = String(n.status ?? "").toUpperCase();
    if (status === "CANCELLED" || status === "DRAFT" || status === "VOIDED") {
      continue;
    }
    const customer = customers.get(String(n.customer_id));
    if (!ownedBy(ctx, customer, n.created_by as string)) {
      continue;
    }
    rows.push({
      fecha: String(n.issue_date).slice(0, DAY),
      ...customerFields(customer, members, n.customer_id as string),
      motivo: (n.reason as string) || null,
      origen: (n.origin_type as string) || null,
      monto: Number(n.amount) || 0,
    });
  }
  return { rows, truncated: notes.truncated, notes: [] };
};

const loadMostrador: Loader = async (ctx, _lookups, range) => {
  const tickets = await fetchAll<Record<string, unknown>>((from, to) =>
    ctx.db
      .from("pos_sales")
      .select("id, sale_date, total_amount, status, invoice_type")
      .eq("organization_id", ctx.organizationId)
      .gte("sale_date", range.from)
      .lte("sale_date", `${range.to}T23:59:59`)
      .order("id")
      .range(from, to)
  );
  const rows: FactRow[] = tickets.rows
    .filter(
      (t) =>
        !["CANCELLED", "VOIDED", "RETURNED"].includes(
          String(t.status ?? "").toUpperCase()
        )
    )
    .map((t) => ({
      fecha: String(t.sale_date).slice(0, DAY),
      comprobante: (t.invoice_type as string) || null,
      total: Number(t.total_amount) || 0,
    }));
  return { rows, truncated: tickets.truncated, notes: [] };
};

const loadClientes: Loader = async (ctx, lookups) => {
  const [list, members] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("customers")
        .select(
          "id, assigned_seller_id, customer_channel, city, delivery_city, province, tax_condition, credit_limit, created_at"
        )
        .eq("organization_id", ctx.organizationId)
        .eq("is_active", true)
        .order("id")
        .range(from, to)
    ),
    lookups.memberMap(),
  ]);
  const rows: FactRow[] = [];
  for (const c of list.rows) {
    const sellerId = c.assigned_seller_id as string | null;
    if (ctx.restrictToUserId && sellerId !== ctx.restrictToUserId) {
      continue;
    }
    rows.push({
      vendedor: sellerId
        ? (members.get(sellerId) ?? "Sin asignar")
        : "Sin asignar",
      canal: (c.customer_channel as string) || null,
      localidad: String(c.delivery_city || c.city || "").trim() || null,
      provincia: (c.province as string) || null,
      condicion_iva: (c.tax_condition as string) || null,
      mes_alta: c.created_at ? `${String(c.created_at).slice(0, 7)}-01` : null,
      limite: Number(c.credit_limit) || 0,
    });
  }
  return { rows, truncated: list.truncated, notes: [] };
};

const loadCobranzas: Loader = async (ctx, lookups, range) => {
  const [payments, customers, members] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("receivable_payments")
        .select(
          "id, payment_date, amount, amount_ars, currency, exchange_rate, payment_method, created_by, cancelled_at, accounts_receivable!inner(customer_id)"
        )
        .eq("organization_id", ctx.organizationId)
        .is("cancelled_at", null)
        .gte("payment_date", range.from)
        .lte("payment_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.customerMap(),
    lookups.memberMap(),
  ]);
  const rows: FactRow[] = [];
  for (const p of payments.rows) {
    const customerId = String(
      (p.accounts_receivable as Record<string, unknown>)?.customer_id ?? ""
    );
    const customer = customers.get(customerId);
    if (!ownedBy(ctx, customer, p.created_by as string)) {
      continue;
    }
    rows.push({
      fecha: String(p.payment_date).slice(0, DAY),
      ...customerFields(customer, members, customerId),
      medio: (p.payment_method as string) || null,
      cobrado:
        p.amount_ars !== null && p.amount_ars !== undefined
          ? Number(p.amount_ars) || 0
          : toArs(p.amount, p.currency as string, p.exchange_rate),
    });
  }
  return { rows, truncated: payments.truncated, notes: [] };
};

const loadDeudaClientes: Loader = async (ctx, lookups) => {
  const [list, customers, members] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("accounts_receivable")
        .select("id, customer_id, pending_balance, due_date, status, currency")
        .eq("organization_id", ctx.organizationId)
        .gt("pending_balance", 0)
        .order("id")
        .range(from, to)
    ),
    lookups.customerMap(),
    lookups.memberMap(),
  ]);
  const rows: FactRow[] = [];
  for (const r of list.rows) {
    const customer = customers.get(String(r.customer_id));
    if (!ownedBy(ctx, customer)) {
      continue;
    }
    const due = r.due_date ? String(r.due_date).slice(0, DAY) : null;
    const saldo = Number(r.pending_balance) || 0;
    rows.push({
      ...customerFields(customer, members, r.customer_id as string),
      antiguedad: agingBucket(due, ctx.today),
      mes_vencimiento: due ? `${due.slice(0, 7)}-01` : null,
      saldo,
      vencido: due && due < ctx.today ? saldo : 0,
    });
  }
  return { rows, truncated: list.truncated, notes: [] };
};

const loadCompras: Loader = async (ctx, lookups, range) => {
  const [orders, suppliers] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("purchase_orders")
        .select(
          "id, supplier_id, purchase_date, status, currency, total_amount, subtotal_amount, tax_amount"
        )
        .eq("organization_id", ctx.organizationId)
        .in("status", PURCHASE_STATUSES)
        .gte("purchase_date", range.from)
        .lte("purchase_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.supplierMap(),
  ]);
  const currencies = new Set(
    orders.rows.map((o) => String(o.currency ?? "ARS"))
  );
  const rows: FactRow[] = orders.rows.map((o) => ({
    fecha: String(o.purchase_date).slice(0, DAY),
    proveedor_id: o.supplier_id as string,
    proveedor: suppliers.get(String(o.supplier_id)) ?? "Sin proveedor",
    estado: STATUS_TEXT[String(o.status)] ?? (o.status as string),
    moneda: (o.currency as string) || "ARS",
    total: Number(o.total_amount) || 0,
    neto: Number(o.subtotal_amount ?? o.total_amount) || 0,
    impuestos: Number(o.tax_amount) || 0,
  }));
  return {
    rows,
    truncated: orders.truncated,
    notes:
      currencies.size > 1
        ? [
            'Hay compras en distintas monedas: abrilas por "Moneda" para no mezclarlas.',
          ]
        : [],
  };
};

const loadComprasProductos: Loader = async (ctx, lookups, range) => {
  const [items, products, suppliers] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("purchase_order_items")
        .select(
          "id, purchase_order_id, product_id, quantity, unit_quantity, subtotal, purchase_orders!inner(purchase_date, supplier_id, status)"
        )
        .eq("organization_id", ctx.organizationId)
        .in("purchase_orders.status", PURCHASE_STATUSES)
        .gte("purchase_orders.purchase_date", range.from)
        .lte("purchase_orders.purchase_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.productMap(),
    lookups.supplierMap(),
  ]);
  const rows: FactRow[] = items.rows.map((item) => {
    const order = item.purchase_orders as Record<string, unknown>;
    const product = products.get(String(item.product_id));
    const byMeasure = product?.unit === "KG" || product?.unit === "LT";
    return {
      fecha: String(order.purchase_date).slice(0, DAY),
      compra_id: item.purchase_order_id as string,
      ...productFields(product, item.product_id as string),
      proveedor:
        suppliers.get(String(order.supplier_id)) ?? product?.supplier ?? null,
      importe: Number(item.subtotal) || 0,
      unidades: Number(item.quantity) || 0,
      kilos: byMeasure ? Number(item.unit_quantity ?? item.quantity) || 0 : 0,
    };
  });
  return { rows, truncated: items.truncated, notes: [] };
};

const loadPagosProveedores: Loader = async (ctx, lookups, range) => {
  const [payments, suppliers] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("payable_payments")
        .select(
          "id, payment_date, amount, amount_ars, currency, exchange_rate, payment_method, cancelled_at, accounts_payable!inner(supplier_id)"
        )
        .eq("organization_id", ctx.organizationId)
        .is("cancelled_at", null)
        .gte("payment_date", range.from)
        .lte("payment_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    lookups.supplierMap(),
  ]);
  const rows: FactRow[] = payments.rows.map((p) => {
    const supplierId = String(
      (p.accounts_payable as Record<string, unknown>)?.supplier_id ?? ""
    );
    return {
      fecha: String(p.payment_date).slice(0, DAY),
      proveedor_id: supplierId,
      proveedor: suppliers.get(supplierId) ?? "Sin proveedor",
      medio: (p.payment_method as string) || null,
      pagado:
        p.amount_ars !== null && p.amount_ars !== undefined
          ? Number(p.amount_ars) || 0
          : toArs(p.amount, p.currency as string, p.exchange_rate),
    };
  });
  return { rows, truncated: payments.truncated, notes: [] };
};

const loadDeudaProveedores: Loader = async (ctx, lookups) => {
  const [list, suppliers] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("accounts_payable")
        .select(
          "id, supplier_id, pending_balance, due_date, currency, exchange_rate"
        )
        .eq("organization_id", ctx.organizationId)
        .gt("pending_balance", 0)
        .order("id")
        .range(from, to)
    ),
    lookups.supplierMap(),
  ]);
  const rows: FactRow[] = list.rows.map((r) => {
    const due = r.due_date ? String(r.due_date).slice(0, DAY) : null;
    const saldo = toArs(
      r.pending_balance,
      r.currency as string,
      r.exchange_rate
    );
    return {
      proveedor: suppliers.get(String(r.supplier_id)) ?? "Sin proveedor",
      antiguedad: agingBucket(due, ctx.today),
      mes_vencimiento: due ? `${due.slice(0, 7)}-01` : null,
      moneda: (r.currency as string) || "ARS",
      saldo,
      vencido: due && due < ctx.today ? saldo : 0,
    };
  });
  return { rows, truncated: list.truncated, notes: [] };
};

function fixedText(category: { is_fixed: boolean } | undefined): string | null {
  if (!category) {
    return null;
  }
  return category.is_fixed ? "Fijo" : "Variable";
}

const loadGastos: Loader = async (ctx, _lookups, range) => {
  const [expenses, categories] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("organization_expenses")
        .select("id, expense_date, amount, category_id, payment_method")
        .eq("organization_id", ctx.organizationId)
        .gte("expense_date", range.from)
        .lte("expense_date", `${range.to}T23:59:59`)
        .order("id")
        .range(from, to)
    ),
    fetchAll<{ id: string; name: string; is_fixed: boolean }>((from, to) =>
      ctx.db
        .from("expense_categories")
        .select("id, name, is_fixed")
        .eq("organization_id", ctx.organizationId)
        .order("id")
        .range(from, to)
    ),
  ]);
  const byId = new Map(categories.rows.map((c) => [c.id, c]));
  const rows: FactRow[] = expenses.rows.map((e) => {
    const category = byId.get(String(e.category_id));
    return {
      fecha: String(e.expense_date).slice(0, DAY),
      categoria: category?.name ?? "Sin categoría",
      tipo: fixedText(category),
      medio: (e.payment_method as string) || null,
      monto: Number(e.amount) || 0,
    };
  });
  return { rows, truncated: expenses.truncated, notes: [] };
};

function stockStatus(stock: number, min: number | null): string {
  if (stock <= 0) {
    return "Sin stock";
  }
  if (min && stock < min) {
    return "Bajo el mínimo";
  }
  return "Con stock";
}

const loadStock: Loader = async (ctx, lookups) => {
  const [list, products] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      ctx.db
        .from("view_stock_detail")
        .select(
          "product_id, total_stock, min_stock, sale_price, is_active, unit_of_measure"
        )
        .eq("organization_id", ctx.organizationId)
        .order("product_id")
        .range(from, to)
    ),
    lookups.productMap(),
  ]);
  const rows: FactRow[] = [];
  for (const s of list.rows) {
    if (s.is_active === false) {
      continue;
    }
    const stock = Number(s.total_stock) || 0;
    const min = s.min_stock === null ? null : Number(s.min_stock);
    const status = stockStatus(stock, min);
    rows.push({
      ...productFields(
        products.get(String(s.product_id)),
        s.product_id as string
      ),
      estado_stock: status,
      unidad: (s.unit_of_measure as string) || null,
      stock,
      valorizado: Math.max(stock, 0) * (Number(s.sale_price) || 0),
      sin_stock: status === "Sin stock" ? 1 : 0,
      bajo_minimo: status === "Bajo el mínimo" ? 1 : 0,
    });
  }
  return { rows, truncated: list.truncated, notes: [] };
};

const ACTIVITY_TEXT: Record<string, string> = {
  visita: "Visita",
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  nota: "Nota",
  pedido: "Pedido",
};

const loadActividad: Loader = async (ctx, lookups, range) => {
  const [events, customers] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) => {
      let query = ctx.db
        .from("commercial_ai_events")
        .select("id, created_at, kind, actor_id, actor_name, customer_id")
        .eq("organization_id", ctx.organizationId)
        .gte("created_at", range.from)
        .lte("created_at", `${range.to}T23:59:59`);
      if (ctx.restrictToUserId) {
        query = query.eq("actor_id", ctx.restrictToUserId);
      }
      return query.order("id").range(from, to);
    }),
    lookups.customerMap(),
  ]);
  const rows: FactRow[] = events.rows.map((e) => {
    const kind = String(e.kind ?? "");
    return {
      fecha: String(e.created_at).slice(0, DAY),
      vendedor: (e.actor_name as string) || "Sistema",
      tipo:
        ACTIVITY_TEXT[kind] ??
        (kind ? kind[0].toUpperCase() + kind.slice(1) : null),
      cliente_id: e.customer_id as string,
      cliente: customers.get(String(e.customer_id))?.name ?? null,
    };
  });
  return { rows, truncated: events.truncated, notes: [] };
};

const LOADERS: Record<string, Loader> = {
  ventas: loadVentas,
  ventas_productos: loadVentasProductos,
  notas_credito: loadNotasCredito,
  mostrador: loadMostrador,
  clientes: loadClientes,
  cobranzas: loadCobranzas,
  deuda_clientes: loadDeudaClientes,
  compras: loadCompras,
  compras_productos: loadComprasProductos,
  pagos_proveedores: loadPagosProveedores,
  deuda_proveedores: loadDeudaProveedores,
  gastos: loadGastos,
  stock: loadStock,
  actividad: loadActividad,
};

/** Lee las filas de una fuente para un período (una sola vez por reporte). */
export function createDatasetReader(ctx: LoaderContext) {
  const lookups = new Lookups(ctx);
  return (datasetId: string, range: DateRange): Promise<LoadResult> => {
    const loader = LOADERS[datasetId];
    if (!loader) {
      throw new Error(`Fuente desconocida: ${datasetId}`);
    }
    return loader(ctx, lookups, range);
  };
}
