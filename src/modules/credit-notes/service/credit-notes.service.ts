import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CreateCreditNoteInput,
  CreateCreditNoteResult,
  CreditNote,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ReceivableStatus = Database["public"]["Enums"]["receivable_status"];

// ---------------------------------------------------------------------------
// Receivable helpers
// ---------------------------------------------------------------------------

function resolveReceivableStatus(
  totalAmount: number,
  pendingBalance: number
): ReceivableStatus {
  if (pendingBalance <= 0) {
    return "PAID";
  }
  if (pendingBalance < totalAmount) {
    return "PARTIALLY_PAID";
  }
  return "PENDING";
}

async function applyNcToReceivable(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  ncAmount: number;
  creditNoteId: string;
}): Promise<void> {
  const { supabase, orgId, saleId, customerId, ncAmount, creditNoteId } =
    params;

  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance")
    .eq("sales_order_id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!receivable?.id) {
    return;
  }

  const previousTotal = truncateMoney(Number(receivable.total_amount ?? 0));
  const previousPending = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const paidAmount = truncateMoney(
    Math.max(0, previousTotal - previousPending)
  );
  const newTotal = truncateMoney(Math.max(0, previousTotal - ncAmount));
  const newPending = truncateMoney(Math.max(0, newTotal - paidAmount));
  const overpaid = truncateMoney(Math.max(0, paidAmount - newTotal));
  const nextStatus = resolveReceivableStatus(newTotal, newPending);

  await supabase
    .from("accounts_receivable")
    .update({
      total_amount: newTotal,
      pending_balance: newPending,
      status: nextStatus,
    })
    .eq("id", receivable.id);

  if (overpaid > 0) {
    await supabase.from("customer_credits").insert({
      organization_id: orgId,
      customer_id: customerId,
      amount: overpaid,
      remaining_amount: overpaid,
      credit_note_id: creditNoteId,
      notes: `Saldo a favor generado por Nota de Crédito ${creditNoteId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

async function validateNcAmountAgainstSaleTotal(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  salesOrderId: string;
  amount: number;
  saleTotal: number;
}): Promise<void> {
  const { supabase, orgId, salesOrderId, amount, saleTotal } = params;

  const { data: existingNcs } = await supabase
    // @ts-expect-error: credit_notes table not yet in generated types
    .from("credit_notes")
    .select("amount")
    .eq("sales_order_id", salesOrderId)
    .eq("organization_id", orgId)
    .eq("status", "CONFIRMED");

  const existingNcTotal = truncateMoney(
    (existingNcs ?? []).reduce(
      // biome-ignore lint/suspicious/noExplicitAny: raw shape
      (acc: number, nc: any) => acc + Number(nc.amount),
      0
    )
  );

  if (truncateMoney(existingNcTotal + amount) > saleTotal) {
    throw new Error(
      `El total de notas de crédito emitidas ($${truncateMoney(existingNcTotal + amount)}) superaría el total de la venta ($${saleTotal})`
    );
  }
}

// ---------------------------------------------------------------------------
// Public entry point: create
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates multi-step NC flow intentionally
export async function createCreditNote(
  input: CreateCreditNoteInput
): Promise<CreateCreditNoteResult> {
  const { orgSlug, salesOrderId, amount, observations, salesReturnId } = input;

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado");
  }

  const { data: sale } = await supabase
    .from("sales_orders")
    .select("id, status, customer_id, total_amount, invoice_type")
    .eq("id", salesOrderId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (!["CONFIRMED", "DISPATCH", "DELIVERED"].includes(sale.status)) {
    throw new Error(
      "Solo se pueden emitir notas de crédito para ventas confirmadas, despachadas o entregadas"
    );
  }

  if (!sale.customer_id) {
    throw new Error("La venta no tiene cliente asociado");
  }

  const saleTotal = truncateMoney(Number(sale.total_amount ?? 0));
  if (amount > saleTotal) {
    throw new Error(
      `El monto de la nota de crédito ($${amount}) no puede superar el total de la venta ($${saleTotal})`
    );
  }

  // Check against current AR total, which may already be lower than saleTotal
  // due to prior returns processed without emitting a credit note.
  const { data: currentReceivable } = await supabase
    .from("accounts_receivable")
    .select("total_amount")
    .eq("sales_order_id", salesOrderId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (currentReceivable) {
    const arTotal = truncateMoney(Number(currentReceivable.total_amount ?? 0));
    if (amount > arTotal) {
      throw new Error(
        `El monto de la nota de crédito ($${amount}) supera el saldo vigente de la venta ($${arTotal})`
      );
    }
  }

  await validateNcAmountAgainstSaleTotal({
    supabase,
    orgId: org.id,
    salesOrderId,
    amount,
    saleTotal,
  });

  // Generate number atomically
  const { data: creditNoteNumber, error: rpcError } = await supabase.rpc(
    // @ts-expect-error: generate_credit_note_number RPC not in generated types
    "generate_credit_note_number",
    { org_id: org.id }
  );

  if (rpcError || !creditNoteNumber) {
    throw new Error("No se pudo generar el número de nota de crédito");
  }

  const { data: record, error: insertError } = (await supabase
    // @ts-expect-error: credit_notes table not yet in generated types
    .from("credit_notes")
    .insert({
      organization_id: org.id,
      sales_order_id: salesOrderId,
      customer_id: sale.customer_id,
      sales_return_id: salesReturnId ?? null,
      credit_note_number: creditNoteNumber,
      issue_date: new Date().toISOString().split("T")[0],
      amount,
      invoice_type: sale.invoice_type,
      observations: observations ?? null,
      status: "CONFIRMED",
      created_by: user.id,
    })
    .select("id")
    .single()) as unknown as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (insertError || !record) {
    throw new Error(
      `No se pudo crear la nota de crédito: ${insertError?.message ?? "error desconocido"}`
    );
  }

  // Solo aplicar al AR cuando la NC es standalone (Flow A).
  // Cuando viene de una devolución (salesReturnId != null), el AR ya fue
  // reducido por updateReceivableForReturn en sale-return.service.ts.
  if (!salesReturnId) {
    await applyNcToReceivable({
      supabase,
      orgId: org.id,
      saleId: salesOrderId,
      customerId: sale.customer_id,
      ncAmount: amount,
      creditNoteId: record.id,
    });
  }

  return { creditNoteId: record.id, creditNoteNumber };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getCreditNotesByOrgSlug(
  orgSlug: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    // @ts-expect-error: credit_notes table not yet in generated types
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      created_at,
      customers(id, business_name, fantasy_name),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount)
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    salesReturnId: row.sales_return_id,
    creditNoteNumber: row.credit_note_number,
    issueDate: row.issue_date,
    amount: Number(row.amount),
    invoiceType: row.invoice_type,
    observations: row.observations,
    status: row.status,
    createdAt: row.created_at,
    customer: row.customers
      ? {
          id: row.customers.id,
          businessName: row.customers.business_name,
          fantasyName: row.customers.fantasy_name,
        }
      : null,
    sale: row.sales_orders
      ? {
          saleNumber: row.sales_orders.sale_number,
          invoiceNumber: row.sales_orders.invoice_number,
          invoiceType: row.sales_orders.invoice_type,
          totalAmount: Number(row.sales_orders.total_amount),
        }
      : null,
  }));
}

export async function getCreditNoteById(
  orgSlug: string,
  creditNoteId: string
): Promise<CreditNote | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    // @ts-expect-error: credit_notes table not yet in generated types
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      created_at,
      customers(id, business_name, fantasy_name),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount)
    `
    )
    .eq("id", creditNoteId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  const row = data as any;

  return {
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    salesReturnId: row.sales_return_id,
    creditNoteNumber: row.credit_note_number,
    issueDate: row.issue_date,
    amount: Number(row.amount),
    invoiceType: row.invoice_type,
    observations: row.observations,
    status: row.status,
    createdAt: row.created_at,
    customer: row.customers
      ? {
          id: row.customers.id,
          businessName: row.customers.business_name,
          fantasyName: row.customers.fantasy_name,
        }
      : null,
    sale: row.sales_orders
      ? {
          saleNumber: row.sales_orders.sale_number,
          invoiceNumber: row.sales_orders.invoice_number,
          invoiceType: row.sales_orders.invoice_type,
          totalAmount: Number(row.sales_orders.total_amount),
        }
      : null,
  };
}

export async function getCreditNotesBySaleId(
  orgSlug: string,
  salesOrderId: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    // @ts-expect-error: credit_notes table not yet in generated types
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      created_at,
      customers(id, business_name, fantasy_name),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount)
    `
    )
    .eq("organization_id", org.id)
    .eq("sales_order_id", salesOrderId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    salesReturnId: row.sales_return_id,
    creditNoteNumber: row.credit_note_number,
    issueDate: row.issue_date,
    amount: Number(row.amount),
    invoiceType: row.invoice_type,
    observations: row.observations,
    status: row.status,
    createdAt: row.created_at,
    customer: row.customers
      ? {
          id: row.customers.id,
          businessName: row.customers.business_name,
          fantasyName: row.customers.fantasy_name,
        }
      : null,
    sale: row.sales_orders
      ? {
          saleNumber: row.sales_orders.sale_number,
          invoiceNumber: row.sales_orders.invoice_number,
          invoiceType: row.sales_orders.invoice_type,
          totalAmount: Number(row.sales_orders.total_amount),
        }
      : null,
  }));
}
