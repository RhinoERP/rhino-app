import "server-only";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MeliConfirmationError } from "../errors";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { meliReceiverSchema } from "../types";
import {
  createMeliPaymentSchema,
  getMeliCollectionBalance,
  meliPaymentSalesFiltersSchema,
  serializeMeliPayment,
  voidMeliPaymentSchema,
} from "../utils/payment-contract";
import {
  cancelMeliPaymentPreparation,
  listMeliPaymentPreparations,
  reverseMeliPaymentAccounting,
} from "./meli-payment-preparations.service";

const rolledBackCodes = new Set([
  "P0001",
  "23505",
  "23514",
  "23503",
  "22023",
  "22P02",
  "22007",
  "42501",
  "40001",
  "40P01",
  "55P03",
]);
const currency = z.enum(["ARS", "USD"]);
const amount = z.number().finite().nonnegative();
const headSchema = z.object({
  sale_id: z.uuid(),
  sale_number: z.number().nullable(),
  marketplace_order_number: z.string(),
  sale_date: z.iso.date(),
  buyer_name: z.string(),
  currency,
  total_amount: amount,
  collected_amount: amount,
  outstanding_amount: amount,
  collection_status: z.enum(["UNPAID", "PARTIAL", "PAID"]),
  sale_status: z.enum(["DELIVERED", "CANCELLED"]),
  arca_status: z.string(),
  invoice_number: z.string().nullable(),
  warehouse_id: z.uuid(),
  warehouse_name: z.string(),
  has_payment_history: z.boolean(),
});
const confirmationSchema = z
  .array(
    z.object({
      payment_id: z.uuid(),
      idempotent: z.boolean(),
      payment_status: z.enum(["RECORDED", "VOIDED"]),
    })
  )
  .length(1);
const historySchema = z.object({
  id: z.uuid(),
  amount,
  currency,
  payment_date: z.iso.date(),
  reference_number: z.string(),
  notes: z.string(),
  status: z.enum(["RECORDED", "VOIDED"]),
  created_by: z.uuid(),
  created_at: z.string(),
  voided_by: z.uuid().nullable(),
  voided_at: z.string().nullable(),
  void_reason: z.string().nullable(),
  fiscal_receiver_snapshot: meliReceiverSchema,
});

async function context(orgSlug: string, write = false) {
  await ensure(
    write ? "mercadolibre.payments.manage" : MELI_PAYMENT_READ_PERMISSIONS,
    orgSlug
  );
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  return {
    orgId: org.id,
    actorId: auth.userId,
    admin: createTypedAdminClient(),
  };
}

type Context = Awaited<ReturnType<typeof context>>;

function mapHead(raw: unknown) {
  const row = headSchema.parse(raw);
  const balance = getMeliCollectionBalance(
    {
      totalAmount: row.total_amount,
      currency: row.currency,
      status: row.sale_status,
    },
    row.collected_amount > 0
      ? [
          {
            amount: row.collected_amount,
            currency: row.currency,
            status: "RECORDED",
          },
        ]
      : []
  );
  if (
    balance.outstandingAmount !== row.outstanding_amount ||
    balance.status !== row.collection_status
  ) {
    throw new Error(
      "El resumen de cobros no coincide con la venta. Actualizá la consulta."
    );
  }
  return {
    saleId: row.sale_id,
    saleNumber: row.sale_number,
    marketplaceOrderNumber: row.marketplace_order_number,
    saleDate: row.sale_date,
    buyerName: row.buyer_name,
    currency: row.currency,
    totalAmount: row.total_amount,
    ...balance,
    saleStatus: row.sale_status,
    arcaStatus: row.arca_status,
    invoiceNumber: row.invoice_number,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    hasPaymentHistory: row.has_payment_history,
  };
}

async function loadSale(ctx: Context, saleId: string) {
  const selectedId = z.uuid().parse(saleId).toLowerCase();
  const result = await ctx.admin.rpc("get_mercadolibre_payment_sale", {
    p_org_id: ctx.orgId,
    p_actor_id: ctx.actorId,
    p_sale_id: selectedId,
  });
  if (result.error) {
    throw new Error(
      "No se pudo consultar la venta o no tenés permiso para sus cobros."
    );
  }
  const row = result.data?.[0];
  if (!row) {
    return null;
  }
  if (row.sale_id !== selectedId) {
    throw new Error(
      "La consulta devolvió una venta diferente de la solicitada."
    );
  }
  return {
    ...mapHead(row),
    receiver: meliReceiverSchema.parse(row.fiscal_receiver_snapshot),
  };
}

export async function getMeliPaymentSale(orgSlug: string, saleId: string) {
  return loadSale(await context(orgSlug), saleId);
}

export async function listMeliPaymentSales(
  orgSlug: string,
  rawFilters: unknown = {}
) {
  const filters = meliPaymentSalesFiltersSchema.parse(rawFilters);
  const ctx = await context(orgSlug);
  const result = await ctx.admin.rpc("list_mercadolibre_payment_sales", {
    p_org_id: ctx.orgId,
    p_actor_id: ctx.actorId,
    p_view: filters.view,
    p_search: filters.search,
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_currency: filters.currency,
  });
  if (result.error) {
    throw new Error("No se pudieron consultar las ventas de Cobros Meli.");
  }
  return {
    data: result.data.map(mapHead),
    filters,
    totalCount: result.data[0]?.total_count ?? (filters.page === 1 ? 0 : null),
  };
}

export async function getMeliPaymentHistory(
  orgSlug: string,
  saleId: string,
  page = 1
) {
  const selectedPage = z.number().int().min(1).max(100_000).parse(page);
  const ctx = await context(orgSlug);
  const sale = await loadSale(ctx, saleId);
  if (!sale) {
    return null;
  }
  const pageSize = 20;
  const result = await ctx.admin
    .from("mercadolibre_payments")
    .select(
      "id, amount, currency, payment_date, reference_number, notes, status, created_by, created_at, voided_by, voided_at, void_reason, fiscal_receiver_snapshot",
      { count: "exact" }
    )
    .eq("organization_id", ctx.orgId)
    .eq("sales_order_id", sale.saleId)
    .eq("warehouse_id", sale.warehouseId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((selectedPage - 1) * pageSize, selectedPage * pageSize - 1);
  if (result.error) {
    throw new Error("No se pudo consultar el historial de cobros Meli.");
  }
  return {
    sale,
    data: result.data.map((record) => historySchema.parse(record)),
    page: selectedPage,
    pageSize,
    totalCount: result.count ?? 0,
  };
}

function confirmed(raw: unknown) {
  const result = confirmationSchema.safeParse(raw);
  if (!result.success) {
    throw new MeliConfirmationError(
      "No se recibió una confirmación verificable. Conciliá el mismo intento.",
      false
    );
  }
  return result.data[0];
}

function paymentError(error: { code: string; message: string }) {
  const canEdit = rolledBackCodes.has(error.code);
  const message =
    error.code === "23505"
      ? "El ID de operación ya tiene un cobro vigente en esta organización. Revisá los registros antes de repetir la carga."
      : "No se pudo confirmar el cobro. Conciliá el mismo intento para evitar duplicados.";
  return new MeliConfirmationError(
    error.code === "P0001" || error.code === "42501" ? error.message : message,
    canEdit
  );
}

export async function createMeliPayment(orgSlug: string, raw: unknown) {
  const input = createMeliPaymentSchema.parse(raw);
  const ctx = await context(orgSlug, true);
  // The RPC verifies scope and replays before checking the current balance/status.
  const result = await Promise.resolve(
    ctx.admin.rpc("commit_mercadolibre_payment", {
      p_org_id: ctx.orgId,
      p_actor_id: ctx.actorId,
      p_idempotency_key: input.idempotencyKey,
      p_payload: serializeMeliPayment(input),
    })
  ).catch(() => {
    throw new MeliConfirmationError(
      "No se obtuvo respuesta del cobro. Reintentá con los mismos datos y clave.",
      false
    );
  });
  if (result.error) {
    throw paymentError(result.error);
  }
  return { ...confirmed(result.data), saleId: input.saleId };
}

export async function voidMeliPayment(orgSlug: string, raw: unknown) {
  const input = voidMeliPaymentSchema.parse(raw);
  const ctx = await context(orgSlug, true);
  const voidPayment = async () =>
    await Promise.resolve(
      ctx.admin.rpc("void_mercadolibre_payment", {
        p_org_id: ctx.orgId,
        p_actor_id: ctx.actorId,
        p_payment_id: input.paymentId,
        p_reason: input.reason,
      })
    ).catch(() => {
      throw new MeliConfirmationError(
        "No se obtuvo respuesta de la anulación. Consultá el registro y reintentá la misma operación.",
        false
      );
    });
  let result = await voidPayment();
  if (
    result.error?.message.includes(
      "Cancelá la preparación contable antes de anular el cobro"
    )
  ) {
    const preparations = await listMeliPaymentPreparations(
      orgSlug,
      input.paymentId
    );
    const active = preparations.find((item) => item.status === "PREPARED");
    if (!active) {
      throw paymentError(result.error);
    }
    if (
      active.components.some(
        (component) => component.dispatchStatus === "UNCERTAIN"
      )
    ) {
      throw new Error(
        "Hay publicaciones contables pendientes de conciliación. Verificá o reintentá cada componente antes de anular."
      );
    }
    if (
      active.components.some(
        (component) => component.dispatchStatus === "PUBLISHED"
      )
    ) {
      await reverseMeliPaymentAccounting(
        orgSlug,
        input.paymentId,
        input.reason
      );
    } else {
      await cancelMeliPaymentPreparation(orgSlug, active.id);
    }
    result = await voidPayment();
  }
  if (result.error) {
    throw paymentError(result.error);
  }
  const payment = confirmed(result.data);
  if (
    payment.payment_id !== input.paymentId.toLowerCase() ||
    payment.payment_status !== "VOIDED"
  ) {
    throw new MeliConfirmationError(
      "La respuesta no confirma la anulación de esta carga. Consultá el historial antes de reintentar.",
      false
    );
  }
  // Authorization was checked by the RPC; this lookup only locates cache targets.
  const source = await ctx.admin
    .from("mercadolibre_payments")
    .select("sales_order_id")
    .eq("organization_id", ctx.orgId)
    .eq("id", payment.payment_id)
    .maybeSingle()
    .then(
      (response) => response.data?.sales_order_id ?? null,
      () => null
    );
  return { ...payment, saleId: source };
}

export type MeliPaymentSale = NonNullable<
  Awaited<ReturnType<typeof getMeliPaymentSale>>
>;
export type MeliPaymentHistory = NonNullable<
  Awaited<ReturnType<typeof getMeliPaymentHistory>>
>;
