"use server";

/**
 * Server action for ARCA emission of Notas de Débito (A, B, C).
 * The underlying WSFE call is identical to credit notes — same buildVoucher,
 * same CbtesAsoc — just different CbteTipo codes (2, 7, 12).
 * We reuse the credit-note invoicing service with the debit note record.
 */

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import {
  type DebitNoteInvoiceType,
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
import { getCurrentUserOrganizationArcaAccess } from "../server/access";
import {
  createArcaClientFromCredentials,
  resolveArcaOrganizationCredentials,
} from "../server/client-factory";
import type { ArcaActionResult } from "../types";

export type EmitDebitNoteArcaResult = {
  debitNoteId: string;
  debitNoteNumber: string | null;
  cae: string | null;
  caeExpiresAt: string | null;
  voucherNumber: number | null;
  voucherTypeCode: number | null;
  pointOfSale: number | null;
};

function getCurrentArcaDateNumber(): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function toJsonValue(value: unknown): Json | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Json;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inline ARCA emission with credential resolution, request building, and persistence
export async function emitDebitNoteArcaInvoiceAction(
  orgSlug: string,
  debitNoteId: string
): Promise<ArcaActionResult<EmitDebitNoteArcaResult>> {
  try {
    const access = await getCurrentUserOrganizationArcaAccess(orgSlug);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("debit_notes")
      .select(`
        id, invoice_type, amount, status, arca_status, arca_cae,
        arca_voucher_number, assoc_invoice_type_code, assoc_invoice_point_of_sale,
        assoc_invoice_number, debit_note_number,
        customer:customers(id, business_name, cuit, tax_condition)
      `)
      .eq("organization_id", access.organization.id)
      .eq("id", debitNoteId)
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Nota de débito no encontrada." };
    }

    if (data.status === "CANCELLED") {
      return { success: false, error: "La nota de débito está cancelada." };
    }

    if (data.arca_status === "authorized" && data.arca_cae) {
      return {
        success: true,
        data: {
          debitNoteId: data.id,
          debitNoteNumber: data.debit_note_number ?? null,
          cae: data.arca_cae,
          caeExpiresAt: null,
          voucherNumber: data.arca_voucher_number ?? null,
          voucherTypeCode: null,
          pointOfSale: null,
        },
      };
    }

    const { data: locked } = await supabase
      .from("debit_notes")
      .update({ arca_status: "in_progress" as never })
      .eq("id", debitNoteId)
      .eq("arca_status", data.arca_status)
      .select("id")
      .maybeSingle();

    if (!locked) {
      return {
        success: false,
        error:
          "La nota de débito fue modificada por otro proceso. Refresca la página e intentá nuevamente.",
      };
    }

    const customer = Array.isArray(data.customer)
      ? data.customer[0]
      : data.customer;
    const credentials = await resolveArcaOrganizationCredentials({
      organizationId: access.organization.id,
      organizationCuit: null, // resolved internally from DB
      actor: "current-user",
    });

    const voucherTypeCode = getArcaCbteTipo(
      data.invoice_type as DebitNoteInvoiceType
    );
    const total = truncateMoney(Number(data.amount));
    const receiverDoc = buildArcaReceiverDocument({
      customerCuit: customer?.cuit ?? null,
      customerTaxCondition: customer?.tax_condition ?? null,
      invoiceType: data.invoice_type,
      totalAmount: total,
    });
    const receiverVatConditionId =
      mapCustomerTaxConditionToArcaReceiverVatConditionId(
        customer?.tax_condition ?? null
      );

    const cbtesAsoc =
      data.assoc_invoice_type_code != null &&
      data.assoc_invoice_point_of_sale != null &&
      data.assoc_invoice_number != null
        ? [
            {
              Tipo: data.assoc_invoice_type_code,
              PtoVta: data.assoc_invoice_point_of_sale,
              Nro: data.assoc_invoice_number,
            },
          ]
        : undefined;

    const request = {
      Concepto: 1,
      DocTipo: receiverDoc.documentType,
      DocNro: receiverDoc.documentNumber,
      CondicionIVAReceptorId: receiverVatConditionId,
      CbteFch: getCurrentArcaDateNumber(),
      ImpTotal: total,
      ImpTotConc: 0,
      ImpNeto: total,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      PtoVta: credentials.pointOfSale,
      CbteTipo: voucherTypeCode,
      ...(cbtesAsoc ? { CbtesAsoc: cbtesAsoc } : {}),
    };

    const arcaClient = createArcaClientFromCredentials({
      cuit: credentials.organizationCuit,
      cert: credentials.cert,
      key: credentials.key,
      environment: credentials.environment,
    });

    // biome-ignore lint/suspicious/noExplicitAny: afip.js dynamic response
    const response = await (arcaClient as any).ElectronicBilling.createVoucher(
      request
    );

    const cae: string = response?.CAE ?? response?.cae ?? "";
    const caeExpiry: string = response?.CAEFchVto ?? response?.caeExpiry ?? "";
    const voucherNumber: number =
      response?.CbteDesde ?? response?.voucherNumber ?? 0;

    if (!(cae && voucherNumber)) {
      throw new ArcaConnectionError(
        "ARCA no devolvió CAE o número de comprobante."
      );
    }

    const caeExpiresAt = caeExpiry
      ? `${caeExpiry.substring(0, 4)}-${caeExpiry.substring(4, 6)}-${caeExpiry.substring(6, 8)}`
      : null;

    const now = new Date().toISOString();
    const debitNoteNumber = `${String(credentials.pointOfSale).padStart(5, "0")}-${String(voucherNumber).padStart(8, "0")}`;

    await supabase
      .from("debit_notes")
      .update({
        arca_status: "authorized",
        arca_cae: cae,
        arca_cae_expires_at: caeExpiresAt,
        arca_authorized_at: now,
        arca_point_of_sale: credentials.pointOfSale,
        arca_voucher_number: voucherNumber,
        arca_voucher_type_code: voucherTypeCode,
        arca_last_error: null,
        arca_request_json: toJsonValue(request),
        arca_response_json: toJsonValue(response),
        debit_note_number: debitNoteNumber,
      })
      .eq("id", debitNoteId);

    return {
      success: true,
      data: {
        debitNoteId,
        debitNoteNumber,
        cae,
        caeExpiresAt,
        voucherNumber,
        voucherTypeCode,
        pointOfSale: credentials.pointOfSale,
      },
    };
  } catch (err) {
    const message =
      err instanceof ArcaValidationError || err instanceof ArcaConnectionError
        ? err.message
        : sanitizeArcaErrorMessage(err);
    return { success: false, error: message };
  }
}
