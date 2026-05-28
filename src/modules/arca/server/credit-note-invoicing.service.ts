import "server-only";

/**
 * ARCA Credit Note Invoicing Service
 *
 * Handles the emission of Notas de Crédito (A, B, C) through AFIP WSFE.
 *
 * Key difference from sale invoices: credit notes require a `CbtesAsoc` array
 * that links the credit note back to the original invoice being credited.
 *
 * WSFE comprobante types:
 *   - Nota de Crédito A → CbteTipo 3  (associated with Factura A, CbteTipo 1)
 *   - Nota de Crédito B → CbteTipo 8  (associated with Factura B, CbteTipo 6)
 *   - Nota de Crédito C → CbteTipo 13 (associated with Factura C, CbteTipo 11)
 */

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import {
  type CreditNoteInvoiceType,
  getArcaCbteTipo,
} from "@/modules/sales/invoice-type-utils";
import type { Json } from "@/types/supabase";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import { buildArcaReceiverDocument } from "../receiver-document";
import { mapCustomerTaxConditionToArcaReceiverVatConditionId } from "../receiver-tax-conditions";
import { getCurrentUserOrganizationArcaAccess } from "./access";
import {
  createArcaClientFromCredentials,
  resolveArcaOrganizationCredentials,
} from "./client-factory";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LoadedCreditNote = {
  id: string;
  organizationId: string;
  invoiceType: CreditNoteInvoiceType;
  issueDate: string;
  amount: number;
  observations: string | null;
  status: string;
  arcaStatus: string;
  arcaCae: string | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaPointOfSale: number | null;
  arcaLastError: string | null;
  arcaRequestJson: Json | null;
  arcaResponseJson: Json | null;
  // Associated original invoice (for CbtesAsoc)
  assocInvoiceTypeCode: number | null;
  assocInvoicePointOfSale: number | null;
  assocInvoiceNumber: number | null;
  customer: {
    id: string;
    businessName: string;
    cuit: string | null;
    taxCondition: string | null;
  };
};

type ArcaCreditNoteVoucherRequest = {
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CondicionIVAReceptorId: number;
  CbteFch: number;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: string;
  MonCotiz: number;
  PtoVta: number;
  CbteTipo: number;
  /** Comprobantes asociados — required for credit/debit notes in WSFE */
  CbtesAsoc?: Array<{
    Tipo: number;
    PtoVta: number;
    Nro: number;
    Cuit?: string;
  }>;
};

export type ArcaCreditNoteResult = {
  creditNoteId: string;
  status: "not_requested" | "pending" | "authorized" | "error";
  creditNoteNumber: string | null;
  cae: string | null;
  caeExpiresAt: string | null;
  authorizedAt: string | null;
  pointOfSale: number | null;
  voucherNumber: number | null;
  voucherTypeCode: number | null;
  lastError: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentArcaDateNumber(): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function toJsonValue(value: unknown): Json | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Json;
}

/**
 * For credit/debit notes that don't have explicit IVA breakdown,
 * we treat the full amount as the "ImpNeto" (taxable base).
 * This is a simplified model — extend if you need per-line IVA on NC/ND.
 */
function buildSimpleVoucherAmounts(amount: number) {
  const total = truncateMoney(amount);
  return {
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: total,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load credit note from DB
// ─────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex data normalization with multiple nullable field resolutions
async function loadCreditNoteForArcaEmission(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<{ organizationId: string; creditNote: LoadedCreditNote }> {
  const access = await getCurrentUserOrganizationArcaAccess(params.orgSlug);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_notes")
    .select(`
      id,
      organization_id,
      invoice_type,
      issue_date,
      amount,
      observations,
      status,
      arca_status,
      arca_cae,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_point_of_sale,
      arca_last_error,
      arca_request_json,
      arca_response_json,
      assoc_invoice_type_code,
      assoc_invoice_point_of_sale,
      assoc_invoice_number,
      customer:customers(id, business_name, cuit, tax_condition)
    `)
    .eq("organization_id", access.organization.id)
    .eq("id", params.creditNoteId)
    .maybeSingle();

  if (error) {
    throw new ArcaValidationError(
      `No se pudo obtener la nota de crédito: ${error.message}`
    );
  }

  if (!data) {
    throw new ArcaValidationError("Nota de crédito no encontrada.");
  }

  if (data.status === "CANCELLED") {
    throw new ArcaValidationError(
      "La nota de crédito está cancelada y no puede emitirse en ARCA."
    );
  }

  const customer = Array.isArray(data.customer)
    ? data.customer[0]
    : data.customer;

  if (!customer) {
    throw new ArcaValidationError(
      "No se encontró el cliente asociado a la nota de crédito."
    );
  }

  return {
    organizationId: access.organization.id,
    creditNote: {
      id: data.id,
      organizationId: data.organization_id,
      invoiceType: data.invoice_type as CreditNoteInvoiceType,
      issueDate: data.issue_date,
      amount: Number(data.amount),
      observations: data.observations ?? null,
      status: data.status,
      arcaStatus: (data.arca_status as string) ?? "not_requested",
      arcaCae: (data.arca_cae as string | null) ?? null,
      arcaVoucherNumber: (data.arca_voucher_number as number | null) ?? null,
      arcaVoucherTypeCode:
        (data.arca_voucher_type_code as number | null) ?? null,
      arcaPointOfSale: (data.arca_point_of_sale as number | null) ?? null,
      arcaLastError: (data.arca_last_error as string | null) ?? null,
      arcaRequestJson: (data.arca_request_json as Json | null) ?? null,
      arcaResponseJson: (data.arca_response_json as Json | null) ?? null,
      assocInvoiceTypeCode:
        (data.assoc_invoice_type_code as number | null) ?? null,
      assocInvoicePointOfSale:
        (data.assoc_invoice_point_of_sale as number | null) ?? null,
      assocInvoiceNumber: (data.assoc_invoice_number as number | null) ?? null,
      customer: {
        id: customer.id,
        businessName: customer.business_name,
        cuit: customer.cuit ?? null,
        taxCondition: customer.tax_condition ?? null,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build WSFE request
// ─────────────────────────────────────────────────────────────────────────────

function buildCreditNoteVoucherRequest(params: {
  creditNote: LoadedCreditNote;
  pointOfSale: number;
  organizationCuit: string;
}): ArcaCreditNoteVoucherRequest {
  const { creditNote, pointOfSale } = params;

  // Derivar el CbteTipo correcto para la NC.
  // Si el tipo guardado es NOTA_DE_CREDITO_A/B/C → usamos directo.
  // Si es FACTURA_A/B/C (NCs creadas antes del fix) → convertimos:
  //   FACTURA_A / assocTipo=1  → NC-A → CbteTipo 3
  //   FACTURA_B / assocTipo=6  → NC-B → CbteTipo 8
  //   FACTURA_C / assocTipo=11 → NC-C → CbteTipo 13
  const ASSOC_TO_NC_CBTE: Record<number, number> = {
    1: 3,
    51: 3,
    6: 8,
    11: 13,
  };
  const FACTURA_TO_NC_CBTE: Record<string, number> = {
    FACTURA_A: 3,
    FACTURA_A_RETENCION: 3,
    FACTURA_B: 8,
    FACTURA_C: 13,
  };

  let voucherTypeCode: number;
  if (
    creditNote.invoiceType === "NOTA_DE_CREDITO_A" ||
    creditNote.invoiceType === "NOTA_DE_CREDITO_B" ||
    creditNote.invoiceType === "NOTA_DE_CREDITO_C"
  ) {
    // Tipo correcto almacenado
    voucherTypeCode = getArcaCbteTipo(creditNote.invoiceType);
  } else if (
    creditNote.assocInvoiceTypeCode != null &&
    ASSOC_TO_NC_CBTE[creditNote.assocInvoiceTypeCode]
  ) {
    // Derivamos del CbteTipo del comprobante original
    voucherTypeCode = ASSOC_TO_NC_CBTE[creditNote.assocInvoiceTypeCode];
  } else if (FACTURA_TO_NC_CBTE[creditNote.invoiceType]) {
    // Fallback: derivamos del tipo de factura almacenado
    voucherTypeCode = FACTURA_TO_NC_CBTE[creditNote.invoiceType];
  } else {
    throw new ArcaValidationError(
      `No se pudo determinar el CbteTipo AFIP para la nota de crédito con tipo "${creditNote.invoiceType}". Verificá el tipo del comprobante.`
    );
  }

  // Para buildArcaReceiverDocument necesitamos el tipo de factura original
  // (no el tipo de NC), porque determina si el receptor necesita CUIT o no.
  // Usamos el tipo almacenado si es FACTURA_*, si es NC_* lo convertimos.
  const NC_TO_FACTURA: Record<string, string> = {
    NOTA_DE_CREDITO_A: "FACTURA_A",
    NOTA_DE_CREDITO_B: "FACTURA_B",
    NOTA_DE_CREDITO_C: "FACTURA_C",
  };
  const effectiveInvoiceTypeForReceiver = (NC_TO_FACTURA[
    creditNote.invoiceType
  ] ?? creditNote.invoiceType) as Parameters<
    typeof buildArcaReceiverDocument
  >[0]["invoiceType"];

  const receiverDocument = buildArcaReceiverDocument({
    customerCuit: creditNote.customer.cuit,
    customerTaxCondition: creditNote.customer.taxCondition,
    invoiceType: effectiveInvoiceTypeForReceiver,
    totalAmount: creditNote.amount,
  });

  const receiverVatConditionId =
    mapCustomerTaxConditionToArcaReceiverVatConditionId(
      creditNote.customer.taxCondition
    );

  const amounts = buildSimpleVoucherAmounts(creditNote.amount);

  // Build CbtesAsoc if we have the original invoice data
  const cbtesAsoc: ArcaCreditNoteVoucherRequest["CbtesAsoc"] =
    creditNote.assocInvoiceTypeCode != null &&
    creditNote.assocInvoicePointOfSale != null &&
    creditNote.assocInvoiceNumber != null
      ? [
          {
            Tipo: creditNote.assocInvoiceTypeCode,
            PtoVta: creditNote.assocInvoicePointOfSale,
            Nro: creditNote.assocInvoiceNumber,
          },
        ]
      : undefined;

  return {
    Concepto: 1, // Productos
    DocTipo: receiverDocument.documentType,
    DocNro: receiverDocument.documentNumber,
    CondicionIVAReceptorId: receiverVatConditionId,
    CbteFch: getCurrentArcaDateNumber(),
    ...amounts,
    MonId: "PES",
    MonCotiz: 1,
    PtoVta: pointOfSale,
    CbteTipo: voucherTypeCode,
    ...(cbtesAsoc ? { CbtesAsoc: cbtesAsoc } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persist helpers
// ─────────────────────────────────────────────────────────────────────────────

async function persistCreditNoteArcaError(params: {
  creditNoteId: string;
  errorMessage: string;
  requestJson: Json | null;
}) {
  const supabase = await createClient();
  await supabase
    .from("credit_notes")
    .update({
      arca_status: "error",
      arca_last_error: params.errorMessage,
      arca_request_json: params.requestJson,
    })
    .eq("id", params.creditNoteId);
}

async function persistAuthorizedCreditNote(params: {
  creditNoteId: string;
  cae: string;
  caeExpiresAt: string;
  voucherNumber: number;
  voucherTypeCode: number;
  pointOfSale: number;
  requestJson: Json;
  responseJson: Json;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const creditNoteNumber = `${String(params.pointOfSale).padStart(5, "0")}-${String(params.voucherNumber).padStart(8, "0")}`;

  await supabase
    .from("credit_notes")
    .update({
      arca_status: "authorized",
      arca_cae: params.cae,
      arca_cae_expires_at: params.caeExpiresAt,
      arca_authorized_at: now,
      arca_point_of_sale: params.pointOfSale,
      arca_voucher_number: params.voucherNumber,
      arca_voucher_type_code: params.voucherTypeCode,
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
      credit_note_number: creditNoteNumber,
    })
    .eq("id", params.creditNoteId);

  return creditNoteNumber;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: emit credit note through ARCA
// ─────────────────────────────────────────────────────────────────────────────

export async function emitCreditNoteArcaInvoice(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<ArcaCreditNoteResult> {
  const supabase = await createClient();
  const { organizationId, creditNote } =
    await loadCreditNoteForArcaEmission(params);

  // Guard: already authorized
  if (
    creditNote.arcaStatus === "authorized" &&
    creditNote.arcaCae &&
    creditNote.arcaVoucherNumber
  ) {
    return {
      creditNoteId: creditNote.id,
      status: "authorized",
      creditNoteNumber: null,
      cae: creditNote.arcaCae,
      caeExpiresAt: null,
      authorizedAt: null,
      pointOfSale: creditNote.arcaPointOfSale,
      voucherNumber: creditNote.arcaVoucherNumber,
      voucherTypeCode: creditNote.arcaVoucherTypeCode,
      lastError: null,
    };
  }

  // Mark as in-progress atomically to prevent duplicate emissions
  const { data: locked } = await supabase
    .from("credit_notes")
    .update({ arca_status: "in_progress" as never })
    .eq("id", creditNote.id)
    .eq("arca_status", creditNote.arcaStatus)
    .select("id")
    .maybeSingle();

  if (!locked) {
    throw new ArcaValidationError(
      "La nota de crédito fue modificada por otro proceso. Refresca la página e intentá nuevamente."
    );
  }

  // Resolve ARCA credentials
  const credentials = await resolveArcaOrganizationCredentials({
    organizationId,
    organizationCuit: null, // resolved internally from DB
    actor: "current-user",
  });

  const arcaClient = createArcaClientFromCredentials({
    cuit: credentials.organizationCuit,
    cert: credentials.cert,
    key: credentials.key,
    environment: credentials.environment,
  });
  const request = buildCreditNoteVoucherRequest({
    creditNote,
    pointOfSale: credentials.pointOfSale,
    organizationCuit: credentials.organizationCuit,
  });

  const requestJson = toJsonValue(request);

  try {
    // biome-ignore lint/suspicious/noExplicitAny: afip.js client returns dynamic shape
    const response = await (arcaClient as any).ElectronicBilling.createVoucher(
      request
    );

    const cae: string = response?.CAE ?? response?.cae ?? "";
    const caeExpiry: string = response?.CAEFchVto ?? response?.caeExpiry ?? "";
    const voucherNumber: number =
      response?.CbteDesde ?? response?.voucherNumber ?? 0;

    if (!(cae && voucherNumber)) {
      throw new ArcaConnectionError(
        "ARCA no devolvió CAE o número de comprobante en la respuesta."
      );
    }

    const caeExpiresAt = caeExpiry
      ? `${caeExpiry.substring(0, 4)}-${caeExpiry.substring(4, 6)}-${caeExpiry.substring(6, 8)}`
      : null;

    const creditNoteNumber = await persistAuthorizedCreditNote({
      creditNoteId: creditNote.id,
      cae,
      caeExpiresAt: caeExpiresAt ?? new Date().toISOString(),
      voucherNumber,
      voucherTypeCode: request.CbteTipo,
      pointOfSale: credentials.pointOfSale,
      requestJson: requestJson ?? {},
      responseJson: toJsonValue(response) ?? {},
    });

    return {
      creditNoteId: creditNote.id,
      status: "authorized",
      creditNoteNumber,
      cae,
      caeExpiresAt,
      authorizedAt: new Date().toISOString(),
      pointOfSale: credentials.pointOfSale,
      voucherNumber,
      voucherTypeCode: request.CbteTipo,
      lastError: null,
    };
  } catch (err) {
    const message = sanitizeArcaErrorMessage(err);
    await persistCreditNoteArcaError({
      creditNoteId: creditNote.id,
      errorMessage: message,
      requestJson,
    });
    throw new ArcaConnectionError(message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: get credit note ARCA result (for UI readiness check)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCreditNoteArcaResult(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<ArcaCreditNoteResult> {
  const { creditNote } = await loadCreditNoteForArcaEmission(params);

  return {
    creditNoteId: creditNote.id,
    status: creditNote.arcaStatus as ArcaCreditNoteResult["status"],
    creditNoteNumber: null,
    cae: creditNote.arcaCae,
    caeExpiresAt: null,
    authorizedAt: null,
    pointOfSale: creditNote.arcaPointOfSale,
    voucherNumber: creditNote.arcaVoucherNumber,
    voucherTypeCode: creditNote.arcaVoucherTypeCode,
    lastError: creditNote.arcaLastError,
  };
}

/**
 * Update the associated invoice metadata on a credit note.
 * Call this after creating a credit note that corresponds to a specific ARCA invoice.
 */
export async function setCreditNoteAssociatedInvoice(params: {
  creditNoteId: string;
  organizationId: string;
  assocInvoiceTypeCode: number;
  assocInvoicePointOfSale: number;
  assocInvoiceNumber: number;
}): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("credit_notes")
    .update({
      assoc_invoice_type_code: params.assocInvoiceTypeCode,
      assoc_invoice_point_of_sale: params.assocInvoicePointOfSale,
      assoc_invoice_number: params.assocInvoiceNumber,
    })
    .eq("id", params.creditNoteId)
    .eq("organization_id", params.organizationId);
}
