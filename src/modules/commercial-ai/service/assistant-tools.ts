import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { CommercialAiSnapshot } from "../types";

/**
 * Herramientas de consulta del asistente.
 *
 * El modelo no recibe toda la base: cuando necesita un dato que no está en el
 * resumen (por ejemplo, cuánto facturó un cliente en 2026) pide una de estas
 * herramientas y el servidor lo calcula sobre las ventas reales. La
 * organización y el alcance (gerente: todo; vendedor: su cartera) los fija el
 * servidor; el modelo nunca los elige.
 */

/** Estados que cuentan como venta: se excluyen preventas (DRAFT) y canceladas. */
const SOLD_STATUSES = ["CONFIRMED", "DISPATCH", "DELIVERED", "INCOMPLETE"];
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const MAX_SEARCH_RESULTS = 10;
const DEFAULT_RANKING = 10;
const MAX_RANKING = 50;
const MAX_ORDER_IDS_PER_QUERY = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHITESPACE = /\s+/;

const nullableString = { type: ["string", "null"] } as const;

export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_clientes",
    description:
      "Busca clientes por nombre, razón social o localidad y devuelve su id. Usala antes de pedir las ventas de un cliente si no tenés su id.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description: "Parte del nombre, razón social o localidad.",
        },
      },
      required: ["texto"],
      additionalProperties: false,
    },
  },
  {
    name: "ventas_de_cliente",
    description:
      "Facturación de UN cliente entre dos fechas: total en pesos y dólares, cantidad de ventas, ticket promedio, desglose por mes, productos más comprados y última compra. Cuenta solo ventas confirmadas, despachadas, entregadas o incompletas (no preventas ni canceladas).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        cliente_id: {
          type: "string",
          description: "Id del cliente (de buscar_clientes o del resumen).",
        },
        desde: {
          type: "string",
          description: "Fecha inicial inclusive, AAAA-MM-DD.",
        },
        hasta: {
          type: "string",
          description: "Fecha final inclusive, AAAA-MM-DD.",
        },
      },
      required: ["cliente_id", "desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    name: "ranking_clientes",
    description:
      "Clientes que más facturaron entre dos fechas, ordenados de mayor a menor, con total, cantidad de ventas y participación sobre el total del período.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
        limite: {
          type: ["integer", "null"],
          description: "Cuántos devolver (por defecto 10, máximo 50).",
        },
      },
      required: ["desde", "hasta", "limite"],
      additionalProperties: false,
    },
  },
  {
    name: "ventas_por_producto",
    description:
      "Productos más vendidos entre dos fechas (cantidad y monto). Si pasás cliente_id, solo de ese cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
        cliente_id: {
          ...nullableString,
          description: "Opcional: limitar a un cliente.",
        },
        limite: {
          type: ["integer", "null"],
          description: "Cuántos devolver (por defecto 10, máximo 50).",
        },
      },
      required: ["desde", "hasta", "cliente_id", "limite"],
      additionalProperties: false,
    },
  },
  {
    name: "ventas_por_vendedor",
    description:
      "Facturación por vendedor entre dos fechas (según el vendedor asignado al cliente). Para un vendedor devuelve solo lo suyo.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
      },
      required: ["desde", "hasta"],
      additionalProperties: false,
    },
  },
];

type OrderRow = {
  id: string;
  customer_id: string | null;
  sale_date: string;
  total_amount: number | string | null;
  currency: string | null;
};

type ToolContext = {
  snapshot: CommercialAiSnapshot;
};

class ToolInputError extends Error {}

function normalize(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function dateRange(input: Record<string, unknown>): {
  from: string;
  to: string;
} {
  const from = String(input.desde ?? "");
  const to = String(input.hasta ?? "");
  if (!(ISO_DATE.test(from) && ISO_DATE.test(to))) {
    throw new ToolInputError("Las fechas tienen que ser AAAA-MM-DD.");
  }
  return from <= to ? { from, to } : { from: to, to: from };
}

function limitOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_RANKING)
    : DEFAULT_RANKING;
}

const round = (value: number) => Math.round(value);

/** Clientes que este usuario puede consultar (el snapshot ya viene filtrado por rol). */
function visibleCustomers(ctx: ToolContext) {
  return new Map(ctx.snapshot.customers.map((c) => [c.id, c]));
}

function assertCustomer(ctx: ToolContext, customerId: unknown) {
  const customer = visibleCustomers(ctx).get(String(customerId ?? ""));
  if (!customer) {
    throw new ToolInputError(
      "Ese cliente no existe o no está en tu cartera. Buscalo con buscar_clientes."
    );
  }
  return customer;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: paginado por lotes de clientes con filtro de alcance
async function fetchOrders(
  ctx: ToolContext,
  range: { from: string; to: string },
  customerIds?: string[]
): Promise<OrderRow[]> {
  const admin = createAdminClient();
  const rows: OrderRow[] = [];
  const chunks = customerIds
    ? Array.from(
        { length: Math.ceil(customerIds.length / MAX_ORDER_IDS_PER_QUERY) },
        (_, i) =>
          customerIds.slice(
            i * MAX_ORDER_IDS_PER_QUERY,
            (i + 1) * MAX_ORDER_IDS_PER_QUERY
          )
      )
    : [null];
  for (const chunk of chunks) {
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      let query = admin
        .from("sales_orders")
        .select("id, customer_id, sale_date, total_amount, currency")
        .eq("organization_id", ctx.snapshot.organizationId)
        .in("status", SOLD_STATUSES)
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (chunk) {
        query = query.in("customer_id", chunk);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      rows.push(...((data ?? []) as OrderRow[]));
      if (!data || data.length < PAGE_SIZE) {
        break;
      }
    }
  }
  // El vendedor solo ve las ventas de su cartera.
  if (ctx.snapshot.role === "vendedor") {
    const allowed = visibleCustomers(ctx);
    return rows.filter(
      (row) => row.customer_id && allowed.has(row.customer_id)
    );
  }
  return rows;
}

function totalsByCurrency(rows: OrderRow[]) {
  let ars = 0;
  let usd = 0;
  for (const row of rows) {
    const amount = Number(row.total_amount ?? 0);
    if (row.currency === "USD") {
      usd += amount;
    } else {
      ars += amount;
    }
  }
  return { ars: round(ars), usd: round(usd) };
}

async function productTotals(
  orderIds: string[],
  ctx: ToolContext,
  limit: number
) {
  if (!orderIds.length) {
    return [];
  }
  const admin = createAdminClient();
  const totals = new Map<string, { quantity: number; amount: number }>();
  for (let i = 0; i < orderIds.length; i += MAX_ORDER_IDS_PER_QUERY) {
    const { data, error } = await admin
      .from("sales_order_items")
      .select("product_id, quantity, subtotal, is_adjustment")
      .eq("organization_id", ctx.snapshot.organizationId)
      .in("sales_order_id", orderIds.slice(i, i + MAX_ORDER_IDS_PER_QUERY))
      .limit(MAX_ROWS);
    if (error) {
      throw new Error(error.message);
    }
    for (const item of data ?? []) {
      if (!item.product_id || item.is_adjustment) {
        continue;
      }
      const entry = totals.get(item.product_id as string) ?? {
        quantity: 0,
        amount: 0,
      };
      entry.quantity += Number(item.quantity ?? 0);
      entry.amount += Number(item.subtotal ?? 0);
      totals.set(item.product_id as string, entry);
    }
  }
  const top = [...totals.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, limit);
  const { data: products } = await admin
    .from("products")
    .select("id, name, unit_of_measure")
    .in(
      "id",
      top.map(([id]) => id)
    );
  const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
  return top.map(([id, value]) => ({
    producto: (byId.get(id)?.name as string | undefined) ?? "Producto",
    cantidad: Math.round(value.quantity * 100) / 100,
    unidad: (byId.get(id)?.unit_of_measure as string | undefined) ?? null,
    monto: round(value.amount),
  }));
}

/* ============ Ejecución de cada herramienta ============ */

function searchCustomers(ctx: ToolContext, input: Record<string, unknown>) {
  const text = normalize(String(input.texto ?? ""));
  if (text.length < 2) {
    throw new ToolInputError("Pasá al menos 2 letras para buscar.");
  }
  const words = text.split(WHITESPACE);
  const matches = ctx.snapshot.customers
    .filter((c) => {
      const haystack = normalize(`${c.name} ${c.city ?? ""}`);
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, MAX_SEARCH_RESULTS)
    .map((c) => ({
      cliente_id: c.id,
      nombre: c.name,
      localidad: c.city,
      vendedor:
        ctx.snapshot.sellers.find((s) => s.id === c.sellerId)?.name ??
        "Sin asignar",
    }));
  return {
    resultados: matches,
    nota: matches.length
      ? undefined
      : "No encontré clientes con ese texto en tu alcance.",
  };
}

async function customerSales(ctx: ToolContext, input: Record<string, unknown>) {
  const customer = assertCustomer(ctx, input.cliente_id);
  const range = dateRange(input);
  const orders = await fetchOrders(ctx, range, [customer.id]);
  const totals = totalsByCurrency(orders);
  const byMonth = new Map<
    string,
    { ventas: number; ars: number; usd: number }
  >();
  for (const order of orders) {
    const month = order.sale_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { ventas: 0, ars: 0, usd: 0 };
    entry.ventas += 1;
    if (order.currency === "USD") {
      entry.usd += Number(order.total_amount ?? 0);
    } else {
      entry.ars += Number(order.total_amount ?? 0);
    }
    byMonth.set(month, entry);
  }
  const last = orders.reduce<string | null>(
    (acc, order) => (!acc || order.sale_date > acc ? order.sale_date : acc),
    null
  );
  return {
    cliente: customer.name,
    periodo: range,
    total_ars: totals.ars,
    total_usd: totals.usd,
    cantidad_ventas: orders.length,
    ticket_promedio_ars: orders.length ? round(totals.ars / orders.length) : 0,
    ultima_compra_en_periodo: last,
    por_mes: [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, value]) => ({
        mes,
        ventas: value.ventas,
        ars: round(value.ars),
        usd: round(value.usd),
      })),
    productos_mas_comprados: await productTotals(
      orders.map((o) => o.id),
      ctx,
      5
    ),
  };
}

async function customerRanking(
  ctx: ToolContext,
  input: Record<string, unknown>
) {
  const range = dateRange(input);
  const limit = limitOf(input.limite);
  const orders = await fetchOrders(ctx, range);
  const customers = visibleCustomers(ctx);
  const byCustomer = new Map<
    string,
    { ars: number; usd: number; ventas: number }
  >();
  for (const order of orders) {
    if (!order.customer_id) {
      continue;
    }
    const entry = byCustomer.get(order.customer_id) ?? {
      ars: 0,
      usd: 0,
      ventas: 0,
    };
    entry.ventas += 1;
    if (order.currency === "USD") {
      entry.usd += Number(order.total_amount ?? 0);
    } else {
      entry.ars += Number(order.total_amount ?? 0);
    }
    byCustomer.set(order.customer_id, entry);
  }
  const totalArs = [...byCustomer.values()].reduce((acc, v) => acc + v.ars, 0);
  return {
    periodo: range,
    total_ars_periodo: round(totalArs),
    clientes_con_compras: byCustomer.size,
    ranking: [...byCustomer.entries()]
      .sort((a, b) => b[1].ars - a[1].ars)
      .slice(0, limit)
      .map(([id, value], index) => ({
        puesto: index + 1,
        cliente_id: id,
        cliente:
          customers.get(id)?.name ?? "Cliente inactivo o fuera de cartera",
        total_ars: round(value.ars),
        total_usd: round(value.usd),
        ventas: value.ventas,
        participacion: totalArs
          ? `${Math.round((value.ars / totalArs) * 1000) / 10} %`
          : "—",
      })),
  };
}

async function productSales(ctx: ToolContext, input: Record<string, unknown>) {
  const range = dateRange(input);
  const limit = limitOf(input.limite);
  const customerIds = input.cliente_id
    ? [assertCustomer(ctx, input.cliente_id).id]
    : undefined;
  const orders = await fetchOrders(ctx, range, customerIds);
  return {
    periodo: range,
    ventas_analizadas: orders.length,
    productos: await productTotals(
      orders.map((o) => o.id),
      ctx,
      limit
    ),
  };
}

async function sellerSales(ctx: ToolContext, input: Record<string, unknown>) {
  const range = dateRange(input);
  const orders = await fetchOrders(ctx, range);
  const customers = visibleCustomers(ctx);
  const bySeller = new Map<
    string,
    { ars: number; usd: number; ventas: number; clientes: Set<string> }
  >();
  for (const order of orders) {
    const sellerId =
      (order.customer_id && customers.get(order.customer_id)?.sellerId) ||
      "sin-asignar";
    const entry = bySeller.get(sellerId) ?? {
      ars: 0,
      usd: 0,
      ventas: 0,
      clientes: new Set<string>(),
    };
    entry.ventas += 1;
    if (order.customer_id) {
      entry.clientes.add(order.customer_id);
    }
    if (order.currency === "USD") {
      entry.usd += Number(order.total_amount ?? 0);
    } else {
      entry.ars += Number(order.total_amount ?? 0);
    }
    bySeller.set(sellerId, entry);
  }
  return {
    periodo: range,
    vendedores: [...bySeller.entries()]
      .sort((a, b) => b[1].ars - a[1].ars)
      .map(([id, value]) => ({
        vendedor:
          ctx.snapshot.sellers.find((s) => s.id === id)?.name ?? "Sin asignar",
        total_ars: round(value.ars),
        total_usd: round(value.usd),
        ventas: value.ventas,
        clientes: value.clientes.size,
      })),
  };
}

const HANDLERS: Record<
  string,
  (ctx: ToolContext, input: Record<string, unknown>) => unknown
> = {
  buscar_clientes: searchCustomers,
  ventas_de_cliente: customerSales,
  ranking_clientes: customerRanking,
  ventas_por_producto: productSales,
  ventas_por_vendedor: sellerSales,
};

/** Ejecuta una herramienta y devuelve el bloque tool_result para el modelo. */
export async function runAssistantTool(
  ctx: ToolContext,
  block: Anthropic.Beta.BetaToolUseBlock
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const handler = HANDLERS[block.name];
  if (!handler) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content: `No existe la herramienta ${block.name}.`,
    };
  }
  try {
    const result = await handler(
      ctx,
      (block.input ?? {}) as Record<string, unknown>
    );
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify(result),
    };
  } catch (error) {
    const known = error instanceof ToolInputError;
    if (!known) {
      console.error(`IA Comercial: falló la herramienta ${block.name}`, error);
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content: known ? error.message : "No pude consultar ese dato ahora.",
    };
  }
}
