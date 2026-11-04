import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import type { SalePriceAdjustment } from "@/modules/price-levels/service/price-calculator";
import type { PriceLevel } from "@/modules/price-levels/types";
import { createPreSaleOrder } from "@/modules/sales/service/sales.service";
import { formatMoney, niceName } from "../engine/analysis";
import type { CommercialAiSnapshot } from "../types";
import {
  isWeightUnit,
  lineFor,
  type OrderLine,
  type OrderProduct,
  orderSummary,
  type PriceAssignment,
  type PricingRules,
  unitPriceFor,
} from "./order-lines";

/**
 * Pedidos del vendedor por WhatsApp. El asistente busca productos, arma el
 * pedido y lo deja como borrador; la preventa se crea recién cuando el
 * vendedor responde "sí" (eso lo resuelve confirmPendingOrder, sin IA).
 * Usa el mismo alta que la pantalla de preventa (createPreSaleOrder).
 */

type Admin = ReturnType<typeof createAdminClient>;
type TrustedClient = NonNullable<
  Parameters<typeof createPreSaleOrder>[1]
>["supabase"];

export class OrderToolError extends Error {}

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const SEARCH_LIMIT = 6;
const SEARCH_CANDIDATES = 60;
const MAX_ITEMS = 30;
const MAX_NOTE = 300;
const ACCENTS = /[̀-ͯ]/g;
const NOT_WORD = /[^a-z0-9]+/g;
const MIN_TERM = 2;
const TRAILING_SLASH = /\/$/;
const MONEY_TOLERANCE = 0.01;
const SALES_PERMISSIONS = [
  "organization.admin",
  "sales.manage",
  "sales.manage.all",
];

type DraftPayload = {
  customerName: string;
  items: { productId: string; amount: number; inPieces: boolean }[];
  lines: OrderLine[];
  note: string | null;
  priceLevelId: string | null;
  salesPriceListId: string | null;
};

function admin(): Admin {
  return createAdminClient();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    .replace(NOT_WORD, " ")
    .trim();
}

function today(snapshot: CommercialAiSnapshot): string {
  return snapshot.today;
}

async function assertCanSell(db: Admin, snapshot: CommercialAiSnapshot) {
  const { data: membership } = await db
    .from("organization_members")
    .select("role_id, is_active, is_owner")
    .eq("organization_id", snapshot.organizationId)
    .eq("user_id", snapshot.currentUserId)
    .maybeSingle();
  if (!membership?.is_active) {
    throw new OrderToolError("Tu usuario no está activo en la empresa.");
  }
  if (membership.is_owner) {
    return;
  }
  const { data: rows } = membership.role_id
    ? await db
        .from("role_permissions")
        .select("permissions(key)")
        .eq("role_id", membership.role_id)
    : { data: [] };
  const keys = (rows ?? []).flatMap((row) => {
    const related = (row as { permissions: unknown }).permissions;
    const list = Array.isArray(related) ? related : [related];
    return list.map((item) => (item as { key?: string } | null)?.key);
  });
  if (!keys.some((key) => key && SALES_PERMISSIONS.includes(key))) {
    throw new OrderToolError(
      "Tu usuario no tiene permiso para cargar ventas. Pedíselo al gerente."
    );
  }
}

function customerOf(snapshot: CommercialAiSnapshot, id: unknown) {
  const customer = snapshot.customers.find((c) => c.id === String(id ?? ""));
  if (!customer) {
    throw new OrderToolError(
      "Ese cliente no está en tu cartera. Buscalo con buscar_clientes."
    );
  }
  return customer;
}

type ProductRow = {
  id: string | null;
  name: string | null;
  sku: string | null;
  brand: string | null;
  supplier_id: string | null;
  calculated_sale_price: number | null;
  cost_price: number | null;
  unit_of_measure: string | null;
};

const PRODUCT_FIELDS =
  "id, name, sku, brand, supplier_id, calculated_sale_price, cost_price, unit_of_measure";

async function withSettings(
  db: Admin,
  organizationId: string,
  rows: ProductRow[]
): Promise<OrderProduct[]> {
  const ids = rows.map((row) => row.id).filter((id): id is string => !!id);
  if (!ids.length) {
    return [];
  }
  const { data, error } = await db
    .from("products")
    .select("id, tracks_stock_units, weight_per_unit, has_variants")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
  const settings = new Map((data ?? []).map((row) => [row.id, row]));
  return rows
    .filter((row): row is ProductRow & { id: string } => !!row.id)
    .map((row) => {
      const extra = settings.get(row.id);
      return {
        id: row.id,
        name: row.name ?? "Producto",
        sku: row.sku,
        supplierId: row.supplier_id,
        basePrice: Number(row.calculated_sale_price ?? 0),
        costPrice: row.cost_price === null ? null : Number(row.cost_price),
        unitOfMeasure: row.unit_of_measure ?? "UN",
        tracksStockUnits: Boolean(extra?.tracks_stock_units),
        weightPerUnit:
          extra?.weight_per_unit === null ||
          extra?.weight_per_unit === undefined
            ? null
            : Number(extra.weight_per_unit),
        hasVariants: Boolean(extra?.has_variants),
      };
    });
}

async function stockOf(
  db: Admin,
  organizationId: string,
  ids: string[]
): Promise<Map<string, { quantity: number; units: number | null }>> {
  const stock = new Map<string, { quantity: number; units: number | null }>();
  if (!ids.length) {
    return stock;
  }
  const { data } = await db
    .from("product_lots")
    .select("product_id, quantity_available, unit_quantity_available")
    .eq("organization_id", organizationId)
    .in("product_id", ids);
  for (const lot of data ?? []) {
    if (!lot.product_id) {
      continue;
    }
    const current = stock.get(lot.product_id) ?? { quantity: 0, units: null };
    stock.set(lot.product_id, {
      quantity: current.quantity + Number(lot.quantity_available ?? 0),
      units:
        lot.unit_quantity_available === null && current.units === null
          ? null
          : (current.units ?? 0) + Number(lot.unit_quantity_available ?? 0),
    });
  }
  return stock;
}

async function activeLevel(
  db: Admin,
  organizationId: string,
  id: string | null
): Promise<PriceLevel | null> {
  if (!id) {
    return null;
  }
  const { data } = await db
    .from("price_levels")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as PriceLevel | null) ?? null;
}

async function activeAdjustment(
  db: Admin,
  organizationId: string,
  id: string | null,
  day: string
): Promise<SalePriceAdjustment[]> {
  if (!id) {
    return [];
  }
  const { data } = await db
    .from("sales_price_lists")
    .select("type, value, is_active, valid_from")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!(data?.is_active && data.valid_from <= day)) {
    return [];
  }
  return [{ type: data.type, value: Number(data.value ?? 0) }];
}

async function configurableLists(
  db: Admin,
  organizationId: string
): Promise<boolean> {
  const { data } = await db
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return settings.configurable_price_lists_enabled === true;
}

type CustomerPricing = {
  rules: PricingRules;
  priceLevelId: string | null;
  salesPriceListId: string | null;
};

/** Asignaciones por proveedor del cliente (listas configurables). */
async function addSupplierRules(
  db: Admin,
  rules: PricingRules,
  scope: { orgId: string; customerId: string; day: string }
) {
  const { orgId, customerId, day } = scope;
  const { data: assignments } = await db
    .from("customer_supplier_assignments")
    .select("supplier_id, price_level_id, price_list_id, sales_price_list_id")
    .eq("customer_id", customerId)
    .eq("organization_id", orgId);
  for (const assignment of assignments ?? []) {
    if (assignment.price_level_id || assignment.sales_price_list_id) {
      const resolved: PriceAssignment = {
        level: await activeLevel(db, orgId, assignment.price_level_id),
        adjustments: await activeAdjustment(
          db,
          orgId,
          assignment.sales_price_list_id,
          day
        ),
      };
      rules.bySupplier.set(assignment.supplier_id, resolved);
    }
    if (!assignment.price_list_id) {
      continue;
    }
    const { data: items } = await db
      .from("price_list_items")
      .select("product_id, cost_price")
      .eq("price_list_id", assignment.price_list_id);
    rules.supplierCosts.set(
      assignment.supplier_id,
      new Map(
        (items ?? []).map((item) => [
          item.product_id,
          Number(item.cost_price ?? 0),
        ])
      )
    );
  }
}

async function pricingFor(
  db: Admin,
  snapshot: CommercialAiSnapshot,
  customerId: string
): Promise<CustomerPricing> {
  const orgId = snapshot.organizationId;
  const day = today(snapshot);
  const { data: customer, error } = await db
    .from("customers")
    .select("id, is_active, price_level_id, sales_price_list_id")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !customer) {
    throw new OrderToolError("No encontré ese cliente en Rhinos.");
  }
  if (customer.is_active === false) {
    throw new OrderToolError("Ese cliente está inactivo en Rhinos.");
  }
  const [level, adjustments, configurable] = await Promise.all([
    activeLevel(db, orgId, customer.price_level_id),
    activeAdjustment(db, orgId, customer.sales_price_list_id, day),
    configurableLists(db, orgId),
  ]);
  const rules: PricingRules = {
    fallback: { level, adjustments },
    bySupplier: new Map(),
    supplierCosts: new Map(),
  };

  if (configurable) {
    await addSupplierRules(db, rules, { orgId, customerId, day });
  }

  return {
    rules,
    priceLevelId: level?.id ?? null,
    salesPriceListId: adjustments.length ? customer.sales_price_list_id : null,
  };
}

function stockText(
  product: OrderProduct,
  stock: { quantity: number; units: number | null } | undefined
): string {
  if (!stock) {
    return "sin stock cargado";
  }
  const unit = product.unitOfMeasure.toLowerCase();
  const amount = stock.quantity.toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  });
  if (product.tracksStockUnits && stock.units !== null) {
    return `${amount} ${unit} (${stock.units} piezas)`;
  }
  return `${amount} ${unit}`;
}

/** Busca productos activos por nombre, código o marca; con precio si hay cliente. */
export async function searchProducts(
  snapshot: CommercialAiSnapshot,
  input: Record<string, unknown>
) {
  const terms = normalize(String(input.texto ?? ""))
    .split(" ")
    .filter((term) => term.length >= MIN_TERM)
    .slice(0, 5);
  if (!terms.length) {
    throw new OrderToolError("Decime qué producto buscás.");
  }
  const db = admin();
  const filters = terms.flatMap((term) =>
    ["name", "sku", "brand"].map((field) => `${field}.ilike.%${term}%`)
  );
  const { data, error } = await db
    .from("products_with_price")
    .select(PRODUCT_FIELDS)
    .eq("organization_id", snapshot.organizationId)
    .eq("is_active", true)
    .or(filters.join(","))
    .limit(SEARCH_CANDIDATES);
  if (error) {
    throw new Error(error.message);
  }
  const ranked = ((data ?? []) as ProductRow[])
    .map((row) => {
      const haystack = normalize(
        `${row.name ?? ""} ${row.sku ?? ""} ${row.brand ?? ""}`
      );
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return { row, score: hits * 10 + (hits === terms.length ? 50 : 0) };
    })
    .sort(
      (a, b) =>
        b.score - a.score || (a.row.name ?? "").localeCompare(b.row.name ?? "")
    )
    .slice(0, SEARCH_LIMIT)
    .map(({ row }) => row);

  const products = await withSettings(db, snapshot.organizationId, ranked);
  const stock = await stockOf(
    db,
    snapshot.organizationId,
    products.map((p) => p.id)
  );
  const pricing = input.cliente_id
    ? await pricingFor(db, snapshot, customerOf(snapshot, input.cliente_id).id)
    : null;

  return {
    productos: products.map((product) => ({
      producto_id: product.id,
      nombre: niceName(product.name),
      codigo: product.sku,
      unidad: product.unitOfMeasure,
      se_vende_por_peso: isWeightUnit(product.unitOfMeasure),
      cuenta_piezas: product.tracksStockUnits,
      kg_por_pieza: product.weightPerUnit,
      con_variantes: product.hasVariants,
      stock: stockText(product, stock.get(product.id)),
      precio: pricing
        ? formatMoney(unitPriceFor(product, pricing.rules))
        : formatMoney(product.basePrice),
      precio_es_del_cliente: Boolean(pricing),
    })),
  };
}

type ItemInput = { productId: string; amount: number; inPieces: boolean };

function parseItems(raw: unknown): ItemInput[] {
  const list = Array.isArray(raw) ? raw : [];
  const items = list.slice(0, MAX_ITEMS).map((item) => {
    const value = (item ?? {}) as Record<string, unknown>;
    return {
      productId: String(value.producto_id ?? ""),
      amount: Number(value.cantidad),
      inPieces: value.en_piezas === true,
    };
  });
  if (!items.length) {
    throw new OrderToolError("El pedido no tiene productos.");
  }
  return items;
}

type PreparedOrder = {
  customerId: string;
  payload: DraftPayload;
  total: number;
};

type OrderRequest = {
  customerId: string;
  items: ItemInput[];
  note: string | null;
};

async function prepare(
  db: Admin,
  snapshot: CommercialAiSnapshot,
  request: OrderRequest
): Promise<PreparedOrder> {
  const { customerId, items, note } = request;
  const customer = customerOf(snapshot, customerId);
  const pricing = await pricingFor(db, snapshot, customer.id);
  const ids = [...new Set(items.map((item) => item.productId))];
  const { data, error } = await db
    .from("products_with_price")
    .select(PRODUCT_FIELDS)
    .eq("organization_id", snapshot.organizationId)
    .eq("is_active", true)
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
  const products = new Map(
    (
      await withSettings(
        db,
        snapshot.organizationId,
        (data ?? []) as ProductRow[]
      )
    ).map((product) => [product.id, product])
  );

  const lines = items.map((item) => {
    const product = products.get(item.productId);
    if (!product) {
      throw new OrderToolError(
        "Hay un producto que no encontré o está inactivo. Buscalo con buscar_productos."
      );
    }
    if (product.hasVariants) {
      throw new OrderToolError(
        `${niceName(product.name)} tiene variantes: ese cargalo desde la app.`
      );
    }
    try {
      return lineFor(
        product,
        item.amount,
        item.inPieces,
        unitPriceFor(product, pricing.rules)
      );
    } catch (lineError) {
      throw new OrderToolError((lineError as Error).message);
    }
  });
  if (lines.some((line) => line.unitPrice <= 0)) {
    const missing = lines.find((line) => line.unitPrice <= 0);
    throw new OrderToolError(
      `${niceName(missing?.name ?? "Un producto")} no tiene precio. Pedile al gerente que lo cargue.`
    );
  }

  let total = 0;
  await createPreSaleOrder(
    {
      orgSlug: snapshot.orgSlug,
      customerId: customer.id,
      sellerId: snapshot.currentUserId,
      saleDate: today(snapshot),
      priceLevelId: pricing.priceLevelId,
      salesPriceListId: pricing.salesPriceListId,
      items: lines.map(toItemInput),
    },
    {
      supabase: db as unknown as TrustedClient,
      organizationId: snapshot.organizationId,
      actorId: snapshot.currentUserId,
      prepareOnly: (prepared) => {
        total = Number(prepared.order.total_amount ?? 0);
      },
    }
  );

  return {
    customerId: customer.id,
    total,
    payload: {
      customerName: customer.name,
      items,
      lines,
      note,
      priceLevelId: pricing.priceLevelId,
      salesPriceListId: pricing.salesPriceListId,
    },
  };
}

function toItemInput(line: OrderLine) {
  return {
    productId: line.productId,
    description: line.estimated
      ? `${line.name} (${line.quantity} piezas, aprox. ${line.weightQuantity} ${line.unit.toLowerCase()})`
      : line.name,
    quantity: line.quantity,
    weightQuantity: line.weightQuantity,
    unitPrice: line.unitPrice,
    basePrice: line.unitPrice,
    tracksStockUnits: line.tracksStockUnits,
  };
}

/** Herramienta preparar_pedido: arma el pedido y lo deja esperando el "sí". */
export async function prepareOrderDraft(
  snapshot: CommercialAiSnapshot,
  input: Record<string, unknown>
) {
  const db = admin();
  await assertCanSell(db, snapshot);
  const note =
    String(input.nota ?? "")
      .trim()
      .slice(0, MAX_NOTE) || null;
  const order = await prepare(db, snapshot, {
    customerId: String(input.cliente_id ?? ""),
    items: parseItems(input.items),
    note,
  });
  await saveDraft(db, snapshot, order);
  return {
    preparado: true,
    resumen_para_el_vendedor: orderSummary({
      customerName: order.payload.customerName,
      lines: order.payload.lines,
      total: order.total,
      note,
    }),
  };
}

async function saveDraft(
  db: Admin,
  snapshot: CommercialAiSnapshot,
  order: PreparedOrder
) {
  const { error } = await db.from("commercial_ai_whatsapp_order_drafts").upsert(
    {
      organization_id: snapshot.organizationId,
      user_id: snapshot.currentUserId,
      customer_id: order.customerId,
      payload: order.payload,
      total: order.total,
      created_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" }
  );
  if (error) {
    throw new Error(error.message);
  }
}

type Draft = {
  customer_id: string;
  payload: DraftPayload;
  total: number;
  created_at: string;
};

/** El borrador vigente del vendedor (vence a las 2 h). */
export async function pendingDraft(
  snapshot: CommercialAiSnapshot
): Promise<Draft | null> {
  const { data } = await admin()
    .from("commercial_ai_whatsapp_order_drafts")
    .select("customer_id, payload, total, created_at")
    .eq("organization_id", snapshot.organizationId)
    .eq("user_id", snapshot.currentUserId)
    .maybeSingle();
  const draft = data as Draft | null;
  if (!draft) {
    return null;
  }
  if (Date.now() - new Date(draft.created_at).getTime() > DRAFT_TTL_MS) {
    await discardDraft(snapshot);
    return null;
  }
  return draft;
}

export async function discardDraft(snapshot: CommercialAiSnapshot) {
  await admin()
    .from("commercial_ai_whatsapp_order_drafts")
    .delete()
    .eq("organization_id", snapshot.organizationId)
    .eq("user_id", snapshot.currentUserId);
}

function preSaleLink(snapshot: CommercialAiSnapshot): string | null {
  const host =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : process.env.NEXT_PUBLIC_APP_URL;
  return host
    ? `${host.replace(TRAILING_SLASH, "")}/org/${snapshot.orgSlug}/preventa`
    : null;
}

/**
 * El vendedor respondió "sí": se recalcula el pedido y, si el total no cambió,
 * se crea la preventa. Si cambió algún precio, se muestra de nuevo.
 */
export async function confirmDraft(
  snapshot: CommercialAiSnapshot,
  draft: Draft
): Promise<string> {
  const db = admin();
  try {
    await assertCanSell(db, snapshot);
    const order = await prepare(db, snapshot, {
      customerId: draft.customer_id,
      items: draft.payload.items,
      note: draft.payload.note,
    });
    if (Math.abs(order.total - Number(draft.total)) > MONEY_TOLERANCE) {
      await saveDraft(db, snapshot, order);
      return `Ojo, cambió algún precio desde que lo armamos.\n\n${orderSummary({
        customerName: order.payload.customerName,
        lines: order.payload.lines,
        total: order.total,
        note: order.payload.note,
      })}`;
    }

    // Se borra antes de crear: un "sí" repetido no duplica la preventa.
    const { data: claimed } = await db
      .from("commercial_ai_whatsapp_order_drafts")
      .delete()
      .eq("organization_id", snapshot.organizationId)
      .eq("user_id", snapshot.currentUserId)
      .eq("created_at", draft.created_at)
      .select("user_id");
    if (!claimed?.length) {
      return "Ese pedido ya se cargó o se canceló.";
    }

    const observations = [
      `Cargado por WhatsApp por ${snapshot.currentUserName}.`,
      order.payload.note,
      order.payload.lines.some((line) => line.estimated)
        ? "Pesos aproximados, se ajustan al pesar."
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    let id: string;
    try {
      id = await createPreSaleOrder(
        {
          orgSlug: snapshot.orgSlug,
          customerId: order.customerId,
          sellerId: snapshot.currentUserId,
          saleDate: today(snapshot),
          observations,
          priceLevelId: order.payload.priceLevelId,
          salesPriceListId: order.payload.salesPriceListId,
          items: order.payload.lines.map(toItemInput),
        },
        {
          supabase: db as unknown as TrustedClient,
          organizationId: snapshot.organizationId,
          actorId: snapshot.currentUserId,
        }
      );
    } catch (createError) {
      // Si falla, el borrador vuelve para poder reintentar con otro "sí".
      await saveDraft(db, snapshot, order).catch((saveError: unknown) => {
        console.error(
          "IA Comercial WhatsApp: no se pudo reponer el borrador",
          saveError
        );
      });
      throw createError;
    }

    const [{ data: created }] = await Promise.all([
      db.from("sales_orders").select("sale_number").eq("id", id).maybeSingle(),
      db.from("commercial_ai_events").insert({
        organization_id: snapshot.organizationId,
        customer_id: order.customerId,
        kind: "note",
        body: `Preventa cargada por WhatsApp · ${formatMoney(order.total)}`,
        actor_id: snapshot.currentUserId,
        actor_name: snapshot.currentUserName,
      }),
    ]);
    const number = created?.sale_number ? ` N° ${created.sale_number}` : "";
    const link = preSaleLink(snapshot);
    return [
      `✅ Listo, cargué la preventa${number} para ${niceName(order.payload.customerName)} por ${formatMoney(order.total)}.`,
      "Queda en borrador para que la revisen y la confirmen en Rhinos.",
      ...(link ? [link] : []),
    ].join("\n");
  } catch (error) {
    if (error instanceof OrderToolError) {
      return error.message;
    }
    console.error(
      "IA Comercial WhatsApp: no se pudo cargar la preventa",
      error
    );
    return "No pude cargar la preventa. Probá de nuevo o cargala desde la app.";
  }
}
