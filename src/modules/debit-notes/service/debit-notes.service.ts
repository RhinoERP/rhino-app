import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type DebitNoteInvoiceType,
  type ExtendedInvoiceType,
  getDebitNoteTypeForInvoice,
} from "@/modules/sales/invoice-type-utils";
import type {
  CreateDebitNoteInput,
  CreateDebitNoteResult,
  DebitNote,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: creates debit note with optional sale lookup, type resolution, and associated invoice capture
export async function createDebitNote(
  input: CreateDebitNoteInput
): Promise<CreateDebitNoteResult> {
  const {
    orgSlug,
    salesOrderId,
    amount,
    observations,
    invoiceType,
    issueDate,
  } = input;

  if (!amount || amount <= 0) {
    throw new Error("El monto de la nota de débito debe ser mayor a 0.");
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Usuario no autenticado.");
  }

  // Determine invoice type automatically from linked sale if not provided
  let resolvedInvoiceType: DebitNoteInvoiceType =
    invoiceType ?? "NOTA_DE_DEBITO_B";
  let customerId = input.customerId ?? "";
  let assocInvoiceTypeCode: number | null = null;
  let assocInvoicePointOfSale: number | null = null;
  let assocInvoiceNumber: number | null = null;

  if (salesOrderId) {
    const { data: sale } = await supabase
      .from("sales_orders")
      .select(
        "customer_id, invoice_type, total_amount, arca_voucher_type_code, arca_point_of_sale, arca_voucher_number"
      )
      .eq("id", salesOrderId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (!sale) {
      throw new Error("Venta no encontrada para esta organización.");
    }

    customerId = sale.customer_id;

    // Auto-derive debit note type from the sale's invoice type
    if (!invoiceType && sale.invoice_type) {
      resolvedInvoiceType = getDebitNoteTypeForInvoice(
        sale.invoice_type as ExtendedInvoiceType
      );
    }

    // Capture original invoice ARCA data for CbtesAsoc
    if (
      sale.arca_voucher_type_code &&
      sale.arca_point_of_sale &&
      sale.arca_voucher_number
    ) {
      assocInvoiceTypeCode = sale.arca_voucher_type_code;
      assocInvoicePointOfSale = sale.arca_point_of_sale;
      assocInvoiceNumber = sale.arca_voucher_number;
    }
  }

  if (!customerId) {
    throw new Error("Se requiere un cliente para la nota de débito.");
  }

  // Generate sequential number (using the debit_note_number_seq)
  const { data: seqData } = await supabase.rpc(
    "nextval" as never,
    { sequence_name: "debit_note_number_seq" } as never
  );
  const seqNumber = (seqData as number | null) ?? Date.now();
  const debitNoteNumber = `ND-${String(seqNumber).padStart(8, "0")}`;

  const insertPayload = {
    organization_id: org.id,
    sales_order_id: salesOrderId ?? null,
    customer_id: customerId,
    invoice_type: resolvedInvoiceType,
    issue_date: issueDate ?? new Date().toISOString().split("T")[0],
    debit_note_number: debitNoteNumber,
    amount: truncateMoney(amount),
    observations: observations ?? null,
    status: "CONFIRMED" as const,
    arca_status: "not_requested",
    assoc_invoice_type_code: assocInvoiceTypeCode,
    assoc_invoice_point_of_sale: assocInvoicePointOfSale,
    assoc_invoice_number: assocInvoiceNumber,
  };

  const { data: record, error } = await supabase
    .from("debit_notes")
    .insert(insertPayload)
    .select("id, debit_note_number")
    .single();

  if (error) {
    throw new Error(`Error al crear la nota de débito: ${error.message}`);
  }

  return {
    debitNoteId: record.id as string,
    debitNoteNumber: record.debit_note_number as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getDebitNotesByOrgSlug(
  orgSlug: string
): Promise<DebitNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("debit_notes")
    .select(`
      *,
      customer:customers(id, business_name, fantasy_name),
      sale:sales_orders(
        sale_number, invoice_number, invoice_type, total_amount,
        arca_voucher_type_code, arca_point_of_sale, arca_voucher_number
      )
    `)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener notas de débito: ${error.message}`);
  }

  return (data ?? []).map(normalizeDebitNote);
}

export async function getDebitNoteById(
  orgSlug: string,
  debitNoteId: string
): Promise<DebitNote | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("debit_notes")
    .select(`
      *,
      customer:customers(id, business_name, fantasy_name),
      sale:sales_orders(
        sale_number, invoice_number, invoice_type, total_amount,
        arca_voucher_type_code, arca_point_of_sale, arca_voucher_number
      )
    `)
    .eq("organization_id", org.id)
    .eq("id", debitNoteId)
    .maybeSingle();

  if (!data) {
    return null;
  }
  return normalizeDebitNote(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize
// ─────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: normalizes multiple nullable ARCA and joined fields from raw DB row
// biome-ignore lint/suspicious/noExplicitAny: Supabase join response with nested relations requires any
function normalizeDebitNote(row: any): DebitNote {
  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
  const sale = Array.isArray(row.sale) ? row.sale[0] : row.sale;

  return {
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id ?? null,
    customerId: row.customer_id,
    invoiceType: row.invoice_type as DebitNoteInvoiceType,
    issueDate: row.issue_date,
    debitNoteNumber: row.debit_note_number ?? null,
    amount: Number(row.amount),
    observations: row.observations ?? null,
    status: row.status as DebitNote["status"],
    arcaStatus: (row.arca_status ?? "not_requested") as DebitNote["arcaStatus"],
    arcaCae: row.arca_cae ?? null,
    arcaCaeExpiresAt: row.arca_cae_expires_at ?? null,
    arcaAuthorizedAt: row.arca_authorized_at ?? null,
    arcaPointOfSale: row.arca_point_of_sale ?? null,
    arcaVoucherNumber: row.arca_voucher_number ?? null,
    arcaVoucherTypeCode: row.arca_voucher_type_code ?? null,
    arcaLastError: row.arca_last_error ?? null,
    assocInvoiceTypeCode: row.assoc_invoice_type_code ?? null,
    assocInvoicePointOfSale: row.assoc_invoice_point_of_sale ?? null,
    assocInvoiceNumber: row.assoc_invoice_number ?? null,
    createdAt: row.created_at,
    customer: customer
      ? {
          id: customer.id,
          businessName: customer.business_name,
          fantasyName: customer.fantasy_name ?? null,
        }
      : null,
    sale: sale
      ? {
          saleNumber: sale.sale_number ?? null,
          invoiceNumber: sale.invoice_number ?? null,
          invoiceType: sale.invoice_type,
          totalAmount: Number(sale.total_amount),
          arcaVoucherTypeCode: sale.arca_voucher_type_code ?? null,
          arcaPointOfSale: sale.arca_point_of_sale ?? null,
          arcaVoucherNumber: sale.arca_voucher_number ?? null,
        }
      : null,
  };
}
