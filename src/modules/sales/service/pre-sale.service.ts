import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "./sales.service";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DELETABLE_PRE_SALE_STATUSES = new Set(["DRAFT", "PENDING"]);
const CANCELLED_SALE_DELETE_BLOCKED_MESSAGE =
  "No se puede eliminar esta venta cancelada porque ya tuvo movimientos de una venta confirmada (cobranza, stock o numeración asignada). Debe conservarse para mantener la trazabilidad.";

type PreSaleDeletionValidation = {
  id: string;
  status: string | null;
  sale_number: number | null;
  invoice_number: string | null;
  remittance_number: string | null;
  arca_status: string | null;
};

function buildSaleMovementReasonCandidates(sale: PreSaleDeletionValidation) {
  const trimmedInvoice = sale.invoice_number?.trim();
  let reference = `Venta ${sale.id.slice(0, 6)}`;

  if (sale.sale_number !== null) {
    reference = `Venta N${sale.sale_number}`;
  } else if (trimmedInvoice) {
    reference = `Venta ${trimmedInvoice}`;
  }

  const reingresoReference = `Reingreso ${reference}`;

  return [
    reference,
    `${reference} %`,
    reingresoReference,
    `${reingresoReference} %`,
    `Venta confirmada ${sale.id}`,
  ] as const;
}

async function hasReceivablePayments(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
}) {
  const { data: receivable, error: receivableError } = await params.supabase
    .from("accounts_receivable")
    .select("id")
    .eq("sales_order_id", params.saleId)
    .eq("organization_id", params.orgId)
    .maybeSingle();

  if (receivableError) {
    throw new Error(
      `No se pudo validar la cobranza asociada a la venta: ${receivableError.message}`
    );
  }

  if (!receivable?.id) {
    return false;
  }

  const { data: payments, error: paymentsError } = await params.supabase
    .from("receivable_payments")
    .select("id")
    .eq("organization_id", params.orgId)
    .eq("account_receivable_id", receivable.id)
    .limit(1);

  if (paymentsError) {
    throw new Error(
      `No se pudo validar los pagos asociados a la venta: ${paymentsError.message}`
    );
  }

  return (payments?.length ?? 0) > 0;
}

async function hasStockMovements(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sale: PreSaleDeletionValidation;
}) {
  const patterns = buildSaleMovementReasonCandidates(params.sale).map(
    (value) => ({
      operator: value.includes("%") ? "ilike" : "eq",
      value,
    })
  );

  for (const pattern of patterns) {
    const query = params.supabase
      .from("stock_movements")
      .select("id")
      .eq("organization_id", params.orgId)
      .limit(1);

    const { data: movements, error: movementsError } =
      pattern.operator === "eq"
        ? await query.eq("reason", pattern.value)
        : await query.ilike("reason", pattern.value);

    if (movementsError) {
      throw new Error(
        `No se pudo validar los movimientos de stock asociados a la venta: ${movementsError.message}`
      );
    }

    if ((movements?.length ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

async function ensureCancelledSaleCanBeDeleted(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sale: PreSaleDeletionValidation;
}) {
  if (params.sale.remittance_number?.trim()) {
    throw new Error(CANCELLED_SALE_DELETE_BLOCKED_MESSAGE);
  }

  const [hasPayments, hasMovements] = await Promise.all([
    hasReceivablePayments({
      supabase: params.supabase,
      orgId: params.orgId,
      saleId: params.sale.id,
    }),
    hasStockMovements({
      supabase: params.supabase,
      orgId: params.orgId,
      sale: params.sale,
    }),
  ]);

  if (hasPayments || hasMovements) {
    throw new Error(CANCELLED_SALE_DELETE_BLOCKED_MESSAGE);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deletion must validate payments, stock traces, ownership and cleanup in a single transactional flow
export async function deletePreSale(orgSlug: string, id: string) {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para gestionar ventas");
  }

  const { data: preSale, error: preSaleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, sale_number, invoice_number, remittance_number, arca_status, user_id"
    )
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (preSaleError) {
    throw new Error(`No se pudo validar la preventa: ${preSaleError.message}`);
  }

  if (!preSale?.id) {
    throw new Error("Preventa no encontrada");
  }

  if (
    !accessContext.isOrganizationAdmin &&
    (!accessContext.userId || preSale.user_id !== accessContext.userId)
  ) {
    throw new Error("Solo puedes gestionar tus propias ventas");
  }

  if (preSale.arca_status === "authorized") {
    throw new Error(
      "No se puede eliminar una preventa que tiene una factura ARCA emitida. Conservála como cancelada para mantener la trazabilidad fiscal."
    );
  }

  const validatedPreSale = preSale as PreSaleDeletionValidation;
  const currentStatus = String(validatedPreSale.status);

  if (currentStatus === "CANCELLED") {
    await ensureCancelledSaleCanBeDeleted({
      supabase,
      orgId: org.id,
      sale: validatedPreSale,
    });
  }

  if (
    currentStatus !== "CANCELLED" &&
    !DELETABLE_PRE_SALE_STATUSES.has(currentStatus)
  ) {
    throw new Error(
      "Solo se pueden eliminar preventas que todavía no fueron confirmadas"
    );
  }

  const { data: receivables, error: receivablesError } = await supabase
    .from("accounts_receivable")
    .select("id")
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (receivablesError) {
    throw new Error(
      `No se pudieron obtener las cuentas por cobrar asociadas: ${receivablesError.message}`
    );
  }

  const receivableIds = (receivables ?? [])
    .map((receivable) => receivable.id)
    .filter((receivableId): receivableId is string => Boolean(receivableId));

  if (receivableIds.length > 0) {
    const { error: deleteReceivablePaymentsError } = await supabase
      .from("receivable_payments")
      .delete()
      .eq("organization_id", org.id)
      .in("account_receivable_id", receivableIds);

    if (deleteReceivablePaymentsError) {
      throw new Error(
        `No se pudieron eliminar los pagos asociados a la cuenta por cobrar: ${deleteReceivablePaymentsError.message}`
      );
    }
  }

  const { error: deleteReceivableError } = await supabase
    .from("accounts_receivable")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteReceivableError) {
    throw new Error(
      `No se pudo eliminar la cuenta por cobrar asociada: ${deleteReceivableError.message}`
    );
  }

  const { error: deleteTaxesError } = await supabase
    .from("sales_order_taxes")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteTaxesError) {
    throw new Error(
      `No se pudieron eliminar los impuestos de la preventa: ${deleteTaxesError.message}`
    );
  }

  const { error: deleteItemsError } = await supabase
    .from("sales_order_items")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteItemsError) {
    throw new Error(
      `No se pudieron eliminar los ítems de la preventa: ${deleteItemsError.message}`
    );
  }

  const { error: deletePreSaleError } = await supabase
    .from("sales_orders")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id);

  if (deletePreSaleError) {
    throw new Error(
      `No se pudo eliminar la preventa: ${deletePreSaleError.message}`
    );
  }
}
