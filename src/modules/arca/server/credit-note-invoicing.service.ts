import "server-only";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase";
import {
  type ArcaCreditNoteLoadedCreditNote,
  type ArcaCreditNoteLoadedSale,
  type ArcaCreditNoteLoadedSourceDocument,
  type ArcaCreditNoteLoadedTax,
  type ArcaCreditNoteVoucherRequest,
  buildArcaCreditNoteVoucherRequest,
  mapInvoiceTypeToArcaCreditNoteVoucherType,
  resolveAssociatedVoucherDate,
} from "../credit-note-invoice-payload";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type { ArcaCreditNoteInvoiceResult } from "../types";
import { validateOrganizationCuit } from "../validation";
import { getCurrentUserOrganizationArcaAccess } from "./access";
import {
  createArcaClientFromCredentials,
  isArcaCertificateExpired,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import { toArcaStatus } from "./settings.service";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];

type LoadedCreditNote = ArcaCreditNoteLoadedCreditNote & {
  organizationId: string;
  salesOrderId: string | null;
  status: string;
  isHistorical: boolean;
  arcaStatus: string;
  arcaCae: string | null;
  arcaCaeExpiresAt: string | null;
  arcaAuthorizedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaLastError: string | null;
  arcaRequestJson: Json | null;
  arcaResponseJson: Json | null;
  arcaAssociatedVoucherTypeCode: number | null;
  arcaAssociatedPointOfSale: number | null;
  arcaAssociatedVoucherNumber: number | null;
  arcaAssociatedVoucherDate: string | null;
};

type LoadedSale = ArcaCreditNoteLoadedSale & {
  status: string;
  arcaStatus: string;
  arcaCae: string | null;
  arcaAuthorizedAt: string | null;
};

type ValidatedCreditNoteContext = {
  orgSlug: string;
  organizationId: string;
  organizationCuit: string;
  resolvedCredentials: Awaited<
    ReturnType<typeof resolveArcaOrganizationCredentials>
  >;
  creditNote: LoadedCreditNote;
  sale: LoadedSale;
  associatedVoucherDate: number;
};

type CreditNoteValidationResult =
  | {
      kind: "ready";
      creditNoteId: string;
      organizationId: string;
      orgSlug: string;
      context: ValidatedCreditNoteContext;
    }
  | {
      kind: "already_authorized";
      result: ArcaCreditNoteInvoiceResult;
    };

type ArcaAuthorization = {
  CAE: string;
  CAEFchVto: string;
  voucherNumber: number;
};

type ArcaClient = ReturnType<typeof createArcaClientFromCredentials>;

const ARCA_VOUCHER_INFO_TIMEOUT_MS = 4000;
const ARCA_COMPACT_DATE_REGEX = /^\d{8}$/;

function normalizeLinkedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toJsonValue(value: unknown): Json | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry) ?? null);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)])
    );
  }

  return String(value);
}

function toArcaTimestamp(dateValue: string): string {
  const trimmed = dateValue.trim();
  const normalized = ARCA_COMPACT_DATE_REGEX.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;
  const value = normalized.includes("T")
    ? normalized
    : `${normalized}T00:00:00.000Z`;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ArcaConnectionError(
      "ARCA devolvió una fecha de vencimiento de CAE inválida."
    );
  }

  return date.toISOString();
}

function toDateColumnFromArcaDate(value: number): string {
  const stringValue = String(value);

  if (!ARCA_COMPACT_DATE_REGEX.test(stringValue)) {
    throw new ArcaValidationError(
      "No se pudo persistir la fecha del comprobante asociado."
    );
  }

  return `${stringValue.slice(0, 4)}-${stringValue.slice(4, 6)}-${stringValue.slice(6, 8)}`;
}

async function getVoucherInfoBestEffort(params: {
  client: ArcaClient;
  voucherNumber: number;
  pointOfSale: number;
  voucherTypeCode: number;
  authorization: ArcaAuthorization;
}): Promise<Json | null> {
  try {
    const voucherInfo = await Promise.race([
      params.client.ElectronicBilling.getVoucherInfo(
        params.voucherNumber,
        params.pointOfSale,
        params.voucherTypeCode
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), ARCA_VOUCHER_INFO_TIMEOUT_MS)
      ),
    ]);

    if (!voucherInfo) {
      return toJsonValue({
        authorization: params.authorization,
        voucherInfoPending: true,
      });
    }

    return toJsonValue({
      authorization: params.authorization,
      voucherInfo,
    });
  } catch (error) {
    return toJsonValue({
      authorization: params.authorization,
      voucherInfoError: sanitizeArcaErrorMessage(error),
    });
  }
}

function toArcaCreditNoteInvoiceResult(
  creditNote: Pick<
    LoadedCreditNote,
    | "id"
    | "arcaStatus"
    | "arcaCae"
    | "arcaCaeExpiresAt"
    | "arcaAuthorizedAt"
    | "arcaPointOfSale"
    | "arcaVoucherNumber"
    | "arcaVoucherTypeCode"
    | "arcaLastError"
    | "arcaRequestJson"
    | "arcaResponseJson"
  >,
  options?: {
    idempotent?: boolean;
  }
): ArcaCreditNoteInvoiceResult {
  return {
    creditNoteId: creditNote.id,
    status:
      creditNote.arcaStatus === "pending" ||
      creditNote.arcaStatus === "authorized" ||
      creditNote.arcaStatus === "error"
        ? creditNote.arcaStatus
        : "not_requested",
    cae: creditNote.arcaCae,
    caeExpiresAt: creditNote.arcaCaeExpiresAt,
    authorizedAt: creditNote.arcaAuthorizedAt,
    pointOfSale: creditNote.arcaPointOfSale,
    voucherNumber: creditNote.arcaVoucherNumber,
    voucherTypeCode: creditNote.arcaVoucherTypeCode,
    lastError: creditNote.arcaLastError,
    requestJson: creditNote.arcaRequestJson,
    responseJson: creditNote.arcaResponseJson,
    idempotent: options?.idempotent ?? false,
  };
}

function normalizeLoadedCreditNoteArcaState(data: {
  arca_status: string | null;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Json | null;
  arca_response_json: Json | null;
  arca_associated_voucher_type_code: number | null;
  arca_associated_point_of_sale: number | null;
  arca_associated_voucher_number: number | null;
  arca_associated_voucher_date: string | null;
}) {
  return {
    arcaStatus: data.arca_status ?? "not_requested",
    arcaCae: data.arca_cae ?? null,
    arcaCaeExpiresAt: data.arca_cae_expires_at ?? null,
    arcaAuthorizedAt: data.arca_authorized_at ?? null,
    arcaPointOfSale: data.arca_point_of_sale ?? null,
    arcaVoucherNumber: data.arca_voucher_number ?? null,
    arcaVoucherTypeCode: data.arca_voucher_type_code ?? null,
    arcaLastError: data.arca_last_error ?? null,
    arcaRequestJson: data.arca_request_json ?? null,
    arcaResponseJson: data.arca_response_json ?? null,
    arcaAssociatedVoucherTypeCode:
      data.arca_associated_voucher_type_code ?? null,
    arcaAssociatedPointOfSale: data.arca_associated_point_of_sale ?? null,
    arcaAssociatedVoucherNumber: data.arca_associated_voucher_number ?? null,
    arcaAssociatedVoucherDate: data.arca_associated_voucher_date ?? null,
  };
}

function normalizeLoadedCreditNote(data: {
  id: string;
  organization_id: string;
  sales_order_id: string | null;
  amount: number;
  invoice_type: InvoiceType;
  status: string;
  is_historical: boolean | null;
  arca_status: string | null;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Json | null;
  arca_response_json: Json | null;
  arca_associated_voucher_type_code: number | null;
  arca_associated_point_of_sale: number | null;
  arca_associated_voucher_number: number | null;
  arca_associated_voucher_date: string | null;
  taxes?: ArcaCreditNoteLoadedTax[];
  sourceDocuments?: ArcaCreditNoteLoadedSourceDocument[];
}): LoadedCreditNote {
  return {
    id: data.id,
    organizationId: data.organization_id,
    salesOrderId: data.sales_order_id,
    amount: truncateMoney(Number(data.amount ?? 0)),
    invoiceType: data.invoice_type,
    status: data.status,
    isHistorical: data.is_historical ?? false,
    taxes: data.taxes ?? [],
    sourceDocuments: data.sourceDocuments ?? [],
    ...normalizeLoadedCreditNoteArcaState(data),
  };
}

function normalizeLoadedSaleTax(item: {
  id?: string | null;
  tax_id?: string | null;
  name?: string | null;
  rate?: number | null;
  tax_amount?: number | null;
  base_amount?: number | null;
  tax_code_snapshot?: string | null;
  tax?:
    | {
        code?: string | null;
      }
    | Array<{
        code?: string | null;
      }>
    | null;
}): ArcaCreditNoteLoadedTax {
  const currentTax = normalizeLinkedRow(item.tax ?? null);

  return {
    id: item.id ?? "",
    taxId: item.tax_id ?? null,
    name: item.name ?? "Impuesto",
    rate: Number(item.rate ?? 0),
    taxAmount: truncateMoney(Number(item.tax_amount ?? 0)),
    baseAmount: truncateMoney(Number(item.base_amount ?? 0)),
    taxCodeSnapshot: item.tax_code_snapshot?.trim() || null,
    currentTaxCode: currentTax?.code?.trim() || null,
  };
}

function normalizeLoadedCreditNoteTax(item: {
  id?: string | null;
  tax_id?: string | null;
  name?: string | null;
  rate?: number | null;
  tax_amount?: number | null;
  base_amount?: number | null;
  tax_code_snapshot?: string | null;
  tax?:
    | {
        code?: string | null;
      }
    | Array<{
        code?: string | null;
      }>
    | null;
}): ArcaCreditNoteLoadedTax {
  return normalizeLoadedSaleTax(item);
}

function normalizeLoadedCreditNoteSourceDocument(item: {
  id?: string | null;
  sales_order_id?: string | null;
  applied_amount?: number | null;
  invoice_type?: InvoiceType | null;
  invoice_number?: string | null;
  arca_status?: string | null;
  arca_point_of_sale?: number | null;
  arca_voucher_number?: number | null;
  arca_voucher_type_code?: number | null;
  arca_voucher_date?: string | null;
}): ArcaCreditNoteLoadedSourceDocument {
  return {
    id: item.id ?? "",
    salesOrderId: item.sales_order_id ?? null,
    appliedAmount: truncateMoney(Number(item.applied_amount ?? 0)),
    invoiceType: item.invoice_type ?? null,
    invoiceNumber: item.invoice_number ?? null,
    arcaStatus: item.arca_status ?? null,
    arcaPointOfSale: item.arca_point_of_sale ?? null,
    arcaVoucherNumber: item.arca_voucher_number ?? null,
    arcaVoucherTypeCode: item.arca_voucher_type_code ?? null,
    arcaVoucherDate: item.arca_voucher_date ?? null,
  };
}

function normalizeLoadedSaleCustomer(
  value:
    | {
        id?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }
    | Array<{
        id?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }>
    | null
): LoadedSale["customer"] {
  const customer = normalizeLinkedRow(value);

  if (!customer?.id) {
    throw new ArcaValidationError(
      "La venta original no tiene un cliente válido asociado."
    );
  }

  return {
    cuit: customer.cuit ?? null,
    taxCondition: customer.tax_condition ?? null,
  };
}

function normalizeLoadedSale(data: {
  id: string;
  status: string;
  sale_date: string;
  invoice_type: InvoiceType;
  total_amount: number;
  arca_status: string | null;
  arca_cae: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_request_json: Json | null;
  customer:
    | {
        id?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }
    | Array<{
        id?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }>
    | null;
  taxes?: Array<{
    id?: string | null;
    tax_id?: string | null;
    name?: string | null;
    rate?: number | null;
    tax_amount?: number | null;
    base_amount?: number | null;
    tax_code_snapshot?: string | null;
    tax?:
      | {
          code?: string | null;
        }
      | Array<{
          code?: string | null;
        }>
      | null;
  }> | null;
}): LoadedSale {
  if (
    !(
      data.arca_point_of_sale &&
      data.arca_voucher_number &&
      data.arca_voucher_type_code
    )
  ) {
    throw new ArcaValidationError(
      "La venta original no tiene comprobante fiscal ARCA persistido."
    );
  }

  return {
    id: data.id,
    status: data.status,
    saleDate: data.sale_date,
    invoiceType: data.invoice_type,
    totalAmount: truncateMoney(Number(data.total_amount ?? 0)),
    arcaStatus: data.arca_status ?? "not_requested",
    arcaCae: data.arca_cae ?? null,
    arcaAuthorizedAt: data.arca_authorized_at ?? null,
    arcaPointOfSale: data.arca_point_of_sale,
    arcaVoucherNumber: data.arca_voucher_number,
    arcaVoucherTypeCode: data.arca_voucher_type_code,
    arcaRequestJson: data.arca_request_json ?? null,
    customer: normalizeLoadedSaleCustomer(data.customer),
    taxes: (data.taxes ?? []).map(normalizeLoadedSaleTax),
  };
}

async function loadCreditNoteForArca(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<{
  organizationId: string;
  organizationCuit: string | null;
  creditNote: LoadedCreditNote;
  sale: LoadedSale | null;
}> {
  const access = await getCurrentUserOrganizationArcaAccess(params.orgSlug);
  const supabase = await createClient();

  const { data: creditNoteData, error: creditNoteError } = await supabase
    .from("credit_notes")
    .select(
      `
        id,
        organization_id,
        sales_order_id,
        amount,
        invoice_type,
        status,
        is_historical,
        arca_status,
        arca_cae,
        arca_cae_expires_at,
        arca_authorized_at,
        arca_point_of_sale,
        arca_voucher_number,
        arca_voucher_type_code,
        arca_last_error,
        arca_request_json,
        arca_response_json,
        arca_associated_voucher_type_code,
        arca_associated_point_of_sale,
        arca_associated_voucher_number,
        arca_associated_voucher_date
      `
    )
    .eq("organization_id", access.organization.id)
    .eq("id", params.creditNoteId)
    .maybeSingle();

  if (creditNoteError) {
    throw new ArcaValidationError(
      `No se pudo obtener la nota de crédito para emitir en ARCA: ${creditNoteError.message}`
    );
  }

  if (!creditNoteData) {
    throw new ArcaValidationError("Nota de crédito no encontrada.");
  }

  const loadedCreditNoteData = creditNoteData as Omit<
    Parameters<typeof normalizeLoadedCreditNote>[0],
    "taxes" | "sourceDocuments"
  >;

  const [creditNoteTaxesResult, sourceDocumentsResult] = await Promise.all([
    supabase
      .from("credit_note_taxes" as never)
      .select(
        "id, tax_id, name, rate, tax_amount, base_amount, tax_code_snapshot, tax:taxes(code)"
      )
      .eq("organization_id" as never, access.organization.id)
      .eq("credit_note_id" as never, params.creditNoteId),
    supabase
      .from("credit_note_source_documents" as never)
      .select(
        "id, sales_order_id, applied_amount, invoice_type, invoice_number, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_voucher_date"
      )
      .eq("organization_id" as never, access.organization.id)
      .eq("credit_note_id" as never, params.creditNoteId),
  ]);

  if (creditNoteTaxesResult.error) {
    throw new ArcaValidationError(
      `No se pudieron obtener impuestos propios de la nota de crédito: ${creditNoteTaxesResult.error.message}`
    );
  }

  if (sourceDocumentsResult.error) {
    throw new ArcaValidationError(
      `No se pudieron obtener comprobantes asociados de la nota de crédito: ${sourceDocumentsResult.error.message}`
    );
  }

  const creditNote = normalizeLoadedCreditNote({
    ...loadedCreditNoteData,
    arca_request_json:
      (loadedCreditNoteData.arca_request_json as Json | null) ?? null,
    arca_response_json:
      (loadedCreditNoteData.arca_response_json as Json | null) ?? null,
    taxes: (
      (creditNoteTaxesResult.data ?? []) as Parameters<
        typeof normalizeLoadedCreditNoteTax
      >[0][]
    ).map(normalizeLoadedCreditNoteTax),
    sourceDocuments: (
      (sourceDocumentsResult.data ?? []) as Parameters<
        typeof normalizeLoadedCreditNoteSourceDocument
      >[0][]
    ).map(normalizeLoadedCreditNoteSourceDocument),
  });

  if (!creditNote.salesOrderId) {
    return {
      organizationId: access.organization.id,
      organizationCuit: access.organization.cuit ?? null,
      creditNote,
      sale: null,
    };
  }

  const { data: saleData, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      `
        id,
        status,
        sale_date,
        invoice_type,
        total_amount,
        arca_status,
        arca_cae,
        arca_authorized_at,
        arca_point_of_sale,
        arca_voucher_number,
        arca_voucher_type_code,
        arca_request_json,
        customer:customers(
          id,
          cuit,
          tax_condition
        ),
        taxes:sales_order_taxes(
          id,
          tax_id,
          name,
          rate,
          tax_amount,
          base_amount,
          tax_code_snapshot,
          tax:taxes(code)
        )
      `
    )
    .eq("organization_id", access.organization.id)
    .eq("id", creditNote.salesOrderId)
    .maybeSingle();

  if (saleError) {
    throw new ArcaValidationError(
      `No se pudo obtener la venta original para emitir la nota de crédito: ${saleError.message}`
    );
  }

  return {
    organizationId: access.organization.id,
    organizationCuit: access.organization.cuit ?? null,
    creditNote,
    sale: saleData
      ? normalizeLoadedSale({
          ...saleData,
          arca_request_json:
            (saleData.arca_request_json as Json | null) ?? null,
        })
      : null,
  };
}

export async function validateCreditNoteForArca(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<CreditNoteValidationResult> {
  const { organizationId, organizationCuit, creditNote, sale } =
    await loadCreditNoteForArca(params);

  if (creditNote.arcaStatus === "authorized") {
    return {
      kind: "already_authorized",
      result: toArcaCreditNoteInvoiceResult(creditNote, {
        idempotent: true,
      }),
    };
  }

  if (creditNote.arcaStatus === "pending") {
    throw new ArcaValidationError(
      "Ya hay una emisión fiscal en curso para esta nota de crédito. Esperá unos segundos e intentá nuevamente."
    );
  }

  if (creditNote.status !== "CONFIRMED") {
    throw new ArcaValidationError(
      "Sólo se pueden emitir notas de crédito confirmadas en ARCA."
    );
  }

  if (creditNote.isHistorical || !creditNote.salesOrderId) {
    throw new ArcaValidationError(
      "En esta fase sólo se emiten notas de crédito ARCA asociadas a ventas."
    );
  }

  if (!sale) {
    throw new ArcaValidationError("Venta original no encontrada.");
  }

  if (creditNote.invoiceType !== sale.invoiceType) {
    throw new ArcaValidationError(
      "La nota de crédito no coincide con el tipo fiscal de la venta original."
    );
  }

  mapInvoiceTypeToArcaCreditNoteVoucherType(creditNote.invoiceType);

  if (sale.arcaStatus !== "authorized" || !sale.arcaCae) {
    throw new ArcaValidationError(
      "La venta original debe estar autorizada en ARCA antes de emitir la nota de crédito fiscal."
    );
  }

  const sourceDocumentsTotal = truncateMoney(
    (creditNote.sourceDocuments ?? []).reduce(
      (sum, source) => sum + source.appliedAmount,
      0
    )
  );
  const fiscalReferenceTotal =
    sourceDocumentsTotal > 0 ? sourceDocumentsTotal : sale.totalAmount;

  if (
    truncateMoney(creditNote.amount) >
    truncateMoney(fiscalReferenceTotal) + 0.01
  ) {
    throw new ArcaValidationError(
      "El importe de la nota de crédito supera el total fiscal de los comprobantes asociados."
    );
  }

  const resolvedCredentials = await resolveArcaOrganizationCredentials({
    organizationId,
    organizationCuit,
    actor: "system",
  });

  if (toArcaStatus(resolvedCredentials.settings.status) !== "connected") {
    throw new ArcaValidationError(
      "La configuración ARCA de la organización no está conectada. Validala desde Configuración > ARCA antes de emitir."
    );
  }

  if (isArcaCertificateExpired(resolvedCredentials.certExpiresAt)) {
    throw new ArcaValidationError(
      "El certificado ARCA de la organización está vencido."
    );
  }

  const validatedOrganizationCuit = validateOrganizationCuit(organizationCuit);
  const associatedVoucherDate = resolveAssociatedVoucherDate(sale);

  return {
    kind: "ready",
    creditNoteId: creditNote.id,
    organizationId,
    orgSlug: params.orgSlug,
    context: {
      orgSlug: params.orgSlug,
      organizationId,
      organizationCuit: validatedOrganizationCuit,
      resolvedCredentials,
      creditNote,
      sale,
      associatedVoucherDate,
    },
  };
}

export function buildArcaCreditNoteRequest(
  context: ValidatedCreditNoteContext
): ArcaCreditNoteVoucherRequest {
  return buildArcaCreditNoteVoucherRequest({
    creditNote: context.creditNote,
    sale: context.sale,
    pointOfSale: context.resolvedCredentials.pointOfSale,
    associatedVoucherDate: context.associatedVoucherDate,
  });
}

export async function markCreditNoteArcaPending(params: {
  orgId: string;
  creditNoteId: string;
  requestJson: Json;
}): Promise<LoadedCreditNote | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("credit_notes")
    .update({
      arca_status: "pending",
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: null,
      updated_at: now,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.creditNoteId)
    .in("arca_status", ["not_requested", "error"])
    .select(
      "id, organization_id, sales_order_id, amount, invoice_type, status, is_historical, arca_status, arca_cae, arca_cae_expires_at, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json, arca_associated_voucher_type_code, arca_associated_point_of_sale, arca_associated_voucher_number, arca_associated_voucher_date"
    )
    .maybeSingle();

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo bloquear la nota de crédito para emitir en ARCA: ${error.message}`
    );
  }

  return data
    ? normalizeLoadedCreditNote({
        ...data,
        arca_request_json: (data.arca_request_json as Json | null) ?? null,
        arca_response_json: (data.arca_response_json as Json | null) ?? null,
      })
    : null;
}

export async function persistAuthorizedCreditNote(params: {
  orgId: string;
  creditNoteId: string;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
  associatedVoucherTypeCode: number;
  associatedPointOfSale: number;
  associatedVoucherNumber: number;
  associatedVoucherDate: number;
  authorization: {
    CAE: string;
    CAEFchVto: string;
  };
  requestJson: Json;
  responseJson: Json;
}): Promise<ArcaCreditNoteInvoiceResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("credit_notes")
    .update({
      arca_status: "authorized",
      arca_cae: params.authorization.CAE,
      arca_cae_expires_at: toArcaTimestamp(params.authorization.CAEFchVto),
      arca_authorized_at: now,
      arca_point_of_sale: params.pointOfSale,
      arca_voucher_number: params.voucherNumber,
      arca_voucher_type_code: params.voucherTypeCode,
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
      arca_associated_voucher_type_code: params.associatedVoucherTypeCode,
      arca_associated_point_of_sale: params.associatedPointOfSale,
      arca_associated_voucher_number: params.associatedVoucherNumber,
      arca_associated_voucher_date: toDateColumnFromArcaDate(
        params.associatedVoucherDate
      ),
      updated_at: now,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.creditNoteId)
    .select(
      "id, organization_id, sales_order_id, amount, invoice_type, status, is_historical, arca_status, arca_cae, arca_cae_expires_at, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json, arca_associated_voucher_type_code, arca_associated_point_of_sale, arca_associated_voucher_number, arca_associated_voucher_date"
    )
    .single();

  if (error || !data) {
    throw new ArcaConnectionError(
      `ARCA autorizó la nota de crédito, pero no se pudo persistir el resultado: ${error?.message ?? "sin respuesta"}`
    );
  }

  return toArcaCreditNoteInvoiceResult(
    normalizeLoadedCreditNote({
      ...data,
      arca_request_json: (data.arca_request_json as Json | null) ?? null,
      arca_response_json: (data.arca_response_json as Json | null) ?? null,
    }),
    {
      idempotent: false,
    }
  );
}

export async function persistCreditNoteArcaError(params: {
  orgId: string;
  creditNoteId: string;
  requestJson: Json | null;
  responseJson: Json | null;
  errorMessage: string;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("credit_notes")
    .update({
      arca_status: "error",
      arca_last_error: params.errorMessage,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.creditNoteId);

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo guardar el error fiscal de la nota de crédito: ${error.message}`
    );
  }
}

export async function emitCreditNote(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<ArcaCreditNoteInvoiceResult> {
  const validation = await validateCreditNoteForArca(params);

  if (validation.kind === "already_authorized") {
    return validation.result;
  }

  const context = validation.context;
  const request = buildArcaCreditNoteRequest(context);
  const associatedVoucher = request.CbtesAsoc[0];
  const requestJson = toJsonValue({
    creditNoteId: context.creditNote.id,
    saleId: context.sale.id,
    invoiceType: context.creditNote.invoiceType,
    creditNoteAmount: context.creditNote.amount,
    saleTotalAmount: context.sale.totalAmount,
    associatedVoucher,
    saleTaxes: context.sale.taxes,
    wsfeRequest: request,
  });

  const pendingCreditNote = await markCreditNoteArcaPending({
    orgId: context.organizationId,
    creditNoteId: context.creditNote.id,
    requestJson: requestJson ?? {},
  });

  if (!pendingCreditNote?.id) {
    const currentValidation = await validateCreditNoteForArca(params);
    if (currentValidation.kind === "already_authorized") {
      return currentValidation.result;
    }

    throw new ArcaValidationError(
      "No se pudo iniciar la emisión fiscal porque la nota de crédito cambió de estado. Reintentá desde el detalle."
    );
  }

  let authorization: ArcaAuthorization | null = null;
  let responseJson: Json | null = null;

  try {
    const client = createArcaClientFromCredentials({
      cuit: context.organizationCuit,
      cert: context.resolvedCredentials.cert,
      key: context.resolvedCredentials.key,
      environment: context.resolvedCredentials.environment,
    });

    const rawAuthorization =
      await client.ElectronicBilling.createNextVoucher(request);
    authorization = {
      CAE: String(rawAuthorization.CAE),
      CAEFchVto: String(rawAuthorization.CAEFchVto),
      voucherNumber: Number(rawAuthorization.voucherNumber),
    };
    responseJson =
      (await getVoucherInfoBestEffort({
        client,
        voucherNumber: authorization.voucherNumber,
        pointOfSale: request.PtoVta,
        voucherTypeCode: request.CbteTipo,
        authorization,
      })) ?? toJsonValue({ authorization });
  } catch (error) {
    const sanitizedError = sanitizeArcaErrorMessage(error);

    if (error instanceof ArcaValidationError) {
      await persistCreditNoteArcaError({
        orgId: context.organizationId,
        creditNoteId: context.creditNote.id,
        requestJson,
        responseJson,
        errorMessage:
          sanitizedError ||
          "No se pudo completar la emisión fiscal de la nota de crédito en ARCA.",
      });
    } else {
      // Do not turn an indeterminate transport outcome into a retryable
      // request. ARCA could already have assigned a CAE to this exact NC.
      const supabase = await createClient();
      await supabase
        .from("credit_notes")
        .update({
          arca_status: "pending",
          arca_last_error:
            "Resultado ARCA indeterminado. Requiere conciliación antes de reintentar para evitar una nota de crédito duplicada.",
          arca_request_json: requestJson,
          arca_response_json: responseJson,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", context.organizationId)
        .eq("id", context.creditNote.id);
    }

    throw new ArcaConnectionError(
      sanitizedError ||
        "No se pudo completar la emisión fiscal de la nota de crédito en ARCA."
    );
  }

  if (!authorization) {
    throw new ArcaConnectionError(
      "No se obtuvo una autorización válida de ARCA para la nota de crédito."
    );
  }

  return persistAuthorizedCreditNote({
    orgId: context.organizationId,
    creditNoteId: context.creditNote.id,
    pointOfSale: request.PtoVta,
    voucherTypeCode: request.CbteTipo,
    voucherNumber: authorization.voucherNumber,
    associatedVoucherTypeCode: associatedVoucher.Tipo,
    associatedPointOfSale: associatedVoucher.PtoVta,
    associatedVoucherNumber: associatedVoucher.Nro,
    associatedVoucherDate: associatedVoucher.CbteFch,
    authorization,
    requestJson: requestJson ?? {},
    responseJson: responseJson ?? toJsonValue({ authorization }) ?? {},
  });
}
