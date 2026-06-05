import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { deriveSaleCreditSupplier } from "@/modules/sales/service/sales.service";
import type { Database } from "@/types/supabase";
import type {
  CreateCreditNoteInput,
  CreateCreditNoteResult,
  CreditNote,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Customer credit helpers
// ---------------------------------------------------------------------------

async function createNcCustomerCredit(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  ncAmount: number;
  creditNoteId: string;
}): Promise<void> {
  const { supabase, orgId, saleId, customerId, ncAmount, creditNoteId } =
    params;

  const creditSupplierId = await deriveSaleCreditSupplier(supabase, saleId);
  await supabase.from("customer_credits").insert({
    organization_id: orgId,
    customer_id: customerId,
    supplier_id: creditSupplierId,
    amount: ncAmount,
    remaining_amount: ncAmount,
    credit_note_id: creditNoteId,
    notes: `Saldo a favor generado por Nota de Crédito ${creditNoteId}`,
  });
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

  const ncAmount = truncateMoney(amount);

  const { data: existingNcs } = await supabase
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

  if (truncateMoney(existingNcTotal + ncAmount) > saleTotal) {
    throw new Error(
      `El total de notas de crédito emitidas ($${truncateMoney(existingNcTotal + ncAmount)}) superaría el total de la venta ($${saleTotal})`
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
  const {
    orgSlug,
    salesOrderId,
    amount,
    observations,
    salesReturnId,
    isHistorical,
    supplierId,
    customerId,
    issueDate,
    invoiceType,
  } = input;

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

  if (isHistorical) {
    if (!customerId) {
      throw new Error("Cliente requerido para NC histórica");
    }

    const { data: ncNum, error: rpcErr } = await supabase.rpc(
      "generate_credit_note_number",
      { org_id: org.id }
    );
    if (rpcErr || !ncNum) {
      throw new Error("No se pudo generar el número de nota de crédito");
    }

    const { data: ncRecord, error: ncInsertError } = await supabase
      .from("credit_notes")
      .insert({
        organization_id: org.id,
        sales_order_id: null,
        customer_id: customerId,
        supplier_id: supplierId ?? null,
        credit_note_number: ncNum,
        issue_date: issueDate ?? new Date().toISOString().split("T")[0],
        amount: truncateMoney(amount),
        invoice_type: (invoiceType ??
          "NOTA_DE_VENTA") as Database["public"]["Enums"]["invoice_type"],
        observations: observations ?? null,
        status: "CONFIRMED",
        is_historical: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (ncInsertError || !ncRecord) {
      throw new Error(
        `No se pudo crear la NC: ${ncInsertError?.message ?? "error desconocido"}`
      );
    }

    await supabase.from("customer_credits").insert({
      organization_id: org.id,
      customer_id: customerId,
      supplier_id: supplierId ?? null,
      amount: truncateMoney(amount),
      remaining_amount: truncateMoney(amount),
      credit_note_id: ncRecord.id,
      notes: `Saldo a favor por Nota de Crédito ${ncNum}`,
    });

    return { creditNoteId: ncRecord.id, creditNoteNumber: ncNum };
  }

  if (!salesOrderId) {
    throw new Error("La venta es requerida para NC no históricas");
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
  if (truncateMoney(amount) > saleTotal) {
    throw new Error(
      `El monto de la nota de crédito ($${truncateMoney(amount)}) no puede superar el total de la venta ($${saleTotal})`
    );
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
    "generate_credit_note_number",
    { org_id: org.id }
  );

  if (rpcError || !creditNoteNumber) {
    throw new Error("No se pudo generar el número de nota de crédito");
  }

  const { data: record, error: insertError } = (await supabase
    .from("credit_notes")
    .insert({
      organization_id: org.id,
      sales_order_id: salesOrderId,
      customer_id: sale.customer_id,
      sales_return_id: salesReturnId ?? null,
      credit_note_number: creditNoteNumber,
      issue_date: new Date().toISOString().split("T")[0],
      amount: truncateMoney(amount),
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

  // Las NCs standalone siempre generan un saldo a favor del cliente
  // sin modificar la cuenta corriente. Las NCs de devolución no generan
  // crédito adicional porque el AR ya fue reducido por la devolución.
  if (!salesReturnId) {
    await createNcCustomerCredit({
      supabase,
      orgId: org.id,
      saleId: salesOrderId,
      customerId: sale.customer_id,
      ncAmount: truncateMoney(amount),
      creditNoteId: record.id,
    });
  }

  return { creditNoteId: record.id, creditNoteNumber };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteRow(row: any): CreditNote {
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

export async function getCreditNotesByOrgSlug(
  orgSlug: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
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
  return (data as any[]).map(mapCreditNoteRow);
}

export async function getCreditNotesByCustomerId(
  orgSlug: string,
  customerId: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
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
      sales_orders(sale_number, invoice_number, invoice_type, total_amount),
      suppliers(name),
      customer_credits(remaining_amount)
    `
    )
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => {
    const remaining = (row.customer_credits ?? []).reduce(
      // biome-ignore lint/suspicious/noExplicitAny: raw Supabase aggregate shape
      (sum: number, c: any) => sum + Number(c.remaining_amount ?? 0),
      0
    );

    return {
      ...mapCreditNoteRow(row),
      remainingAmount: truncateMoney(remaining),
      supplierName: row.suppliers?.name ?? null,
    };
  });
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

  return mapCreditNoteRow(data);
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
  return (data as any[]).map(mapCreditNoteRow);
}
