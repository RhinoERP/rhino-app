import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import {
  type ArcaPosVoucherRequest,
  buildArcaVoucherRequestFromPosSale as buildPosSaleVoucherRequest,
  type PosArcaInvoiceType,
  type PosArcaLoadedSale,
  type PosArcaLoadedTax,
  type PosArcaVoucherRequestContext,
} from "../pos-sale-invoice-payload";
import type { ArcaSaleInvoiceResult } from "../types";
import { validateOrganizationCuit } from "../validation";
import { getCurrentUserOrganizationArcaAccess } from "./access";
import {
  createArcaClientFromCredentials,
  isArcaCertificateExpired,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import { toArcaStatus } from "./settings.service";

type PosInvoiceType = Database["public"]["Enums"]["invoice_type_enum"];

type LoadedPosSaleItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number | null;
  subtotal: number;
  taxRate: number | null;
};

type LoadedPosSale = PosArcaLoadedSale & {
  organizationId: string;
  status: string | null;
  saleDate: string | null;
  invoiceType: PosInvoiceType;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  subtotalAmount: number;
  discountAmount: number | null;
  cae: string | null;
  caeExpirationDate: string | null;
  arcaStatus: string;
  arcaLastError: string | null;
  arcaRequestJson: Json | null;
  arcaResponseJson: Json | null;
  arcaAuthorizedAt: string | null;
  arcaRequestedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  customer: {
    id: string;
    businessName: string;
    fantasyName: string | null;
    cuit: string | null;
  } | null;
  items: LoadedPosSaleItem[];
};

type ValidatedPosSaleContext = {
  orgSlug: string;
  organizationId: string;
  organizationCuit: string;
  resolvedCredentials: Awaited<
    ReturnType<typeof resolveArcaOrganizationCredentials>
  >;
  sale: LoadedPosSale;
  invoiceType: PosArcaInvoiceType;
};

type PosAuthorization = {
  CAE: string;
  CAEFchVto: string;
  voucherNumber: number;
};

type ArcaClient = ReturnType<typeof createArcaClientFromCredentials>;
type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};
type PosVoucherReservationRow = Pick<
  LoadedPosSale,
  | "id"
  | "arcaStatus"
  | "arcaRequestJson"
  | "arcaRequestedAt"
  | "arcaPointOfSale"
  | "arcaVoucherTypeCode"
  | "arcaVoucherNumber"
>;

const ARCA_VOUCHER_INFO_TIMEOUT_MS = 8000;
const ARCA_COMPACT_DATE_REGEX = /^\d{8}$/;
const POS_SALE_VOUCHER_UNIQUE_CONSTRAINT = "pos_sales_arca_voucher_unique_idx";
const STALE_PENDING_POS_VOUCHER_RESERVATION_MS = 15_000;
const RELEASABLE_POS_VOUCHER_STATUSES = [
  "not_requested",
  "error",
  "pending_invoicing",
  "pending",
];
const SUPPORTED_POS_INVOICE_TYPES = new Set<string>(["FACTURA_B", "FACTURA_C"]);
const POS_VOUCHER_TYPE_TO_INVOICE_TYPE: Record<number, PosArcaInvoiceType> = {
  6: "FACTURA_B",
  11: "FACTURA_C",
};

class PosVoucherReservationConflictError extends ArcaConnectionError {
  readonly reservation: {
    orgId: string;
    posSaleId: string;
    pointOfSale: number;
    voucherTypeCode: number;
    voucherNumber: number;
  };

  constructor(
    reservation: {
      orgId: string;
      posSaleId: string;
      pointOfSale: number;
      voucherTypeCode: number;
      voucherNumber: number;
    },
    message: string
  ) {
    super(message);
    this.reservation = reservation;
  }
}

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

function isPosVoucherUniqueConstraintError(error: PostgrestLikeError): boolean {
  const message = `${error.message ?? ""} ${error.details ?? ""}`;

  return (
    error.code === "23505" &&
    message.includes(POS_SALE_VOUCHER_UNIQUE_CONSTRAINT)
  );
}

function isReleasablePosVoucherReservation(
  reservation: PosVoucherReservationRow
): boolean {
  if (reservation.arcaStatus !== "pending") {
    return RELEASABLE_POS_VOUCHER_STATUSES.includes(reservation.arcaStatus);
  }

  if (!reservation.arcaRequestedAt) {
    return true;
  }

  const requestedAt = new Date(reservation.arcaRequestedAt).getTime();

  return (
    !Number.isFinite(requestedAt) ||
    Date.now() - requestedAt >= STALE_PENDING_POS_VOUCHER_RESERVATION_MS
  );
}

function normalizeMoney(value: number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function normalizeNullableMoney(
  value: number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeMoney(value);
}

function normalizeArcaExpirationTimestamp(value: string): string {
  const trimmed = value.trim();
  const normalized = ARCA_COMPACT_DATE_REGEX.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;
  const dateValue = normalized.includes("T")
    ? normalized
    : `${normalized}T00:00:00.000Z`;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new ArcaConnectionError(
      "ARCA devolvió una fecha de vencimiento de CAE inválida."
    );
  }

  return date.toISOString();
}

function formatArcaInvoiceNumber(
  pointOfSale: number,
  voucherNumber: number
): string {
  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

function normalizeLoadedPosSaleItem(item: {
  id?: string | null;
  product_id?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  discount_amount?: number | null;
  subtotal?: number | null;
  tax_rate?: number | null;
}): LoadedPosSaleItem {
  return {
    id: item.id ?? "",
    productId: item.product_id ?? "",
    quantity: Number(item.quantity ?? 0),
    unitPrice: normalizeMoney(item.unit_price),
    discountAmount: normalizeNullableMoney(item.discount_amount),
    subtotal: normalizeMoney(item.subtotal),
    taxRate:
      item.tax_rate !== null && item.tax_rate !== undefined
        ? Number(item.tax_rate)
        : null,
  };
}

function normalizeLoadedPosSaleTax(item: {
  id?: string | null;
  tax_id?: string | null;
  name?: string | null;
  rate?: number | null;
  tax_amount?: number | null;
  base_amount?: number | null;
  tax_code_snapshot?: string | null;
}): PosArcaLoadedTax {
  return {
    id: item.id ?? "",
    taxId: item.tax_id ?? null,
    name: item.name ?? "Impuesto",
    rate: Number(item.rate ?? 0),
    taxAmount: normalizeMoney(item.tax_amount),
    baseAmount: normalizeMoney(item.base_amount),
    taxCodeSnapshot: item.tax_code_snapshot?.trim() || null,
  };
}

function normalizeLoadedPosSaleCustomer(
  value:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
      }>
    | null
): LoadedPosSale["customer"] {
  const customer = normalizeLinkedRow(value);

  if (!customer?.id) {
    return null;
  }

  return {
    id: customer.id,
    businessName: customer.business_name ?? "Consumidor final",
    fantasyName: customer.fantasy_name ?? null,
    cuit: customer.cuit ?? null,
  };
}

function normalizeLoadedPosSale(data: {
  id: string;
  organization_id: string;
  status: string | null;
  sale_date: string | null;
  invoice_type: PosInvoiceType;
  invoice_number: string | null;
  receipt_number: string | null;
  subtotal_amount: number;
  discount_amount: number | null;
  tax_amount: number | null;
  total_amount: number;
  cae: string | null;
  cae_expiration_date: string | null;
  arca_status: string | null;
  arca_last_error: string | null;
  arca_request_json: Json | null;
  arca_response_json: Json | null;
  arca_authorized_at: string | null;
  arca_requested_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
      }>
    | null;
  items?: Array<{
    id?: string | null;
    product_id?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    discount_amount?: number | null;
    subtotal?: number | null;
    tax_rate?: number | null;
  }> | null;
  taxes?: Array<{
    id?: string | null;
    tax_id?: string | null;
    name?: string | null;
    rate?: number | null;
    tax_amount?: number | null;
    base_amount?: number | null;
    tax_code_snapshot?: string | null;
  }> | null;
}): LoadedPosSale {
  return {
    id: data.id,
    organizationId: data.organization_id,
    status: data.status,
    saleDate: data.sale_date,
    invoiceType: data.invoice_type,
    invoiceNumber: data.invoice_number,
    receiptNumber: data.receipt_number,
    subtotalAmount: normalizeMoney(data.subtotal_amount),
    discountAmount: normalizeNullableMoney(data.discount_amount),
    taxAmount: normalizeNullableMoney(data.tax_amount),
    totalAmount: normalizeMoney(data.total_amount),
    cae: data.cae ?? null,
    caeExpirationDate: data.cae_expiration_date ?? null,
    arcaStatus: data.arca_status ?? "not_requested",
    arcaLastError: data.arca_last_error ?? null,
    arcaRequestJson: data.arca_request_json ?? null,
    arcaResponseJson: data.arca_response_json ?? null,
    arcaAuthorizedAt: data.arca_authorized_at ?? null,
    arcaRequestedAt: data.arca_requested_at ?? null,
    arcaPointOfSale: data.arca_point_of_sale ?? null,
    arcaVoucherNumber: data.arca_voucher_number ?? null,
    arcaVoucherTypeCode: data.arca_voucher_type_code ?? null,
    customer: normalizeLoadedPosSaleCustomer(data.customer),
    items: (data.items ?? []).map(normalizeLoadedPosSaleItem),
    taxes: (data.taxes ?? []).map(normalizeLoadedPosSaleTax),
  };
}

function toArcaSaleInvoiceResult(
  sale: Pick<
    LoadedPosSale,
    | "id"
    | "invoiceNumber"
    | "cae"
    | "caeExpirationDate"
    | "arcaAuthorizedAt"
    | "arcaPointOfSale"
    | "arcaVoucherNumber"
    | "arcaVoucherTypeCode"
    | "arcaLastError"
    | "arcaRequestJson"
    | "arcaResponseJson"
    | "arcaStatus"
  >,
  options?: { idempotent?: boolean }
): ArcaSaleInvoiceResult {
  return {
    saleId: sale.id,
    status:
      sale.arcaStatus === "pending" ||
      sale.arcaStatus === "pending_invoicing" ||
      sale.arcaStatus === "authorized" ||
      sale.arcaStatus === "error"
        ? sale.arcaStatus
        : "not_requested",
    invoiceNumber: sale.invoiceNumber,
    cae: sale.cae,
    caeExpiresAt: sale.caeExpirationDate,
    authorizedAt: sale.arcaAuthorizedAt,
    pointOfSale: sale.arcaPointOfSale,
    voucherNumber: sale.arcaVoucherNumber,
    voucherTypeCode: sale.arcaVoucherTypeCode,
    lastError: sale.arcaLastError,
    requestJson: sale.arcaRequestJson,
    responseJson: sale.arcaResponseJson,
    idempotent: options?.idempotent ?? false,
  };
}

function assertPosInvoiceType(
  value: string | null | undefined
): PosArcaInvoiceType {
  if (value === "FACTURA_B" || value === "FACTURA_C") {
    return value;
  }

  throw new ArcaValidationError(
    "La venta POS solo puede emitirse como Factura B o Factura C."
  );
}

async function loadPosSaleForArcaInvoicing(params: {
  orgSlug: string;
  posSaleId: string;
}): Promise<{
  organizationId: string;
  organizationCuit: string | null;
  sale: LoadedPosSale;
}> {
  const access = await getCurrentUserOrganizationArcaAccess(params.orgSlug);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
        id,
        organization_id,
        status,
        sale_date,
        invoice_type,
        invoice_number,
        receipt_number,
        subtotal_amount,
        discount_amount,
        tax_amount,
        total_amount,
        cae,
        cae_expiration_date,
        arca_status,
        arca_last_error,
        arca_request_json,
        arca_response_json,
        arca_authorized_at,
        arca_requested_at,
        arca_point_of_sale,
        arca_voucher_number,
        arca_voucher_type_code,
        customer:customers(
          id,
          business_name,
          fantasy_name,
          cuit
        ),
        items:pos_sale_items(
          id,
          product_id,
          quantity,
          unit_price,
          discount_amount,
          subtotal,
          tax_rate
        ),
        taxes:pos_sale_taxes(
          id,
          tax_id,
          name,
          rate,
          tax_amount,
          base_amount,
          tax_code_snapshot
        )
      `
    )
    .eq("organization_id", access.organization.id)
    .eq("id", params.posSaleId)
    .maybeSingle();

  if (error) {
    throw new ArcaValidationError(
      `No se pudo obtener la venta POS para emitir en ARCA: ${error.message}`
    );
  }

  if (!data) {
    throw new ArcaValidationError("Venta POS no encontrada.");
  }

  return {
    organizationId: access.organization.id,
    organizationCuit: access.organization.cuit ?? null,
    sale: normalizeLoadedPosSale(
      data as unknown as Parameters<typeof normalizeLoadedPosSale>[0]
    ),
  };
}

async function validatePosSaleForArcaInvoicing(params: {
  orgSlug: string;
  posSaleId: string;
  invoiceType: PosArcaInvoiceType;
}): Promise<
  | {
      kind: "already_authorized";
      result: ArcaSaleInvoiceResult;
    }
  | {
      kind: "ready";
      context: ValidatedPosSaleContext;
    }
> {
  const { organizationId, organizationCuit, sale } =
    await loadPosSaleForArcaInvoicing(params);

  if (sale.arcaStatus === "authorized" && sale.cae) {
    return {
      kind: "already_authorized",
      result: toArcaSaleInvoiceResult(sale, { idempotent: true }),
    };
  }

  if (
    sale.arcaStatus === "pending" &&
    !isReleasablePosVoucherReservation(sale)
  ) {
    throw new ArcaValidationError(
      "Ya hay una emisión fiscal en curso para esta venta POS. Esperá unos segundos e intentá nuevamente."
    );
  }

  if (sale.status !== "COMPLETED") {
    throw new ArcaValidationError(
      "Solo se pueden emitir en ARCA ventas POS completadas."
    );
  }

  if (sale.invoiceNumber?.trim() && !sale.cae) {
    throw new ArcaValidationError(
      "La venta POS ya tiene un número de comprobante manual. Revisalo antes de emitir en ARCA."
    );
  }

  if (sale.items.length === 0) {
    throw new ArcaValidationError(
      "La venta POS no tiene un detalle persistido válido para emitir en ARCA."
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

  return {
    kind: "ready",
    context: {
      orgSlug: params.orgSlug,
      organizationId,
      organizationCuit: validatedOrganizationCuit,
      resolvedCredentials,
      sale,
      invoiceType: params.invoiceType,
    },
  };
}

async function getVoucherInfoWithTimeout(params: {
  client: ArcaClient;
  voucherNumber: number;
  pointOfSale: number;
  voucherTypeCode: number;
}): Promise<unknown | null> {
  try {
    return await Promise.race([
      params.client.ElectronicBilling.getVoucherInfo(
        params.voucherNumber,
        params.pointOfSale,
        params.voucherTypeCode
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), ARCA_VOUCHER_INFO_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}

function parseAuthorizationFromVoucherInfo(
  voucherInfo: unknown,
  voucherNumber: number
): PosAuthorization | null {
  if (!voucherInfo || typeof voucherInfo !== "object") {
    return null;
  }

  const value = voucherInfo as Record<string, unknown>;
  const cae = value.CodAutorizacion ?? value.CAE;
  const caeExpiration = value.FchVto ?? value.CAEFchVto;

  if (!(cae && caeExpiration)) {
    return null;
  }

  return {
    CAE: String(cae),
    CAEFchVto: String(caeExpiration),
    voucherNumber,
  };
}

async function reconcileVoucherReservation(params: {
  client: ArcaClient;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
}): Promise<{
  authorization: PosAuthorization;
  responseJson: Json;
} | null> {
  const voucherInfo = await getVoucherInfoWithTimeout(params);
  const authorization = parseAuthorizationFromVoucherInfo(
    voucherInfo,
    params.voucherNumber
  );

  if (!authorization) {
    return null;
  }

  return {
    authorization,
    responseJson:
      toJsonValue({
        authorization,
        voucherInfo,
        reconciled: true,
      }) ?? {},
  };
}

async function markPosSaleInvoicePending(params: {
  orgId: string;
  posSaleId: string;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
  requestJson: Json;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pos_sales")
    .update({
      arca_status: "pending",
      arca_requested_at: now,
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: null,
      arca_point_of_sale: params.pointOfSale,
      arca_voucher_type_code: params.voucherTypeCode,
      arca_voucher_number: params.voucherNumber,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId)
    .in("arca_status", ["not_requested", "error", "pending_invoicing"])
    .select(
      "id, arca_status, invoice_number, cae, cae_expiration_date, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json"
    )
    .maybeSingle();

  if (error) {
    if (isPosVoucherUniqueConstraintError(error)) {
      throw new PosVoucherReservationConflictError(
        {
          orgId: params.orgId,
          posSaleId: params.posSaleId,
          pointOfSale: params.pointOfSale,
          voucherTypeCode: params.voucherTypeCode,
          voucherNumber: params.voucherNumber,
        },
        `El comprobante POS ${formatArcaInvoiceNumber(params.pointOfSale, params.voucherNumber)} ya está reservado localmente.`
      );
    }

    throw new ArcaConnectionError(
      `No se pudo bloquear la venta POS para emitir en ARCA: ${error.message}`
    );
  }

  return data;
}

async function getConflictingPosVoucherReservation(params: {
  orgId: string;
  posSaleId: string;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
}): Promise<PosVoucherReservationRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      "id, arca_status, arca_request_json, arca_requested_at, arca_point_of_sale, arca_voucher_type_code, arca_voucher_number"
    )
    .eq("organization_id", params.orgId)
    .eq("arca_point_of_sale", params.pointOfSale)
    .eq("arca_voucher_type_code", params.voucherTypeCode)
    .eq("arca_voucher_number", params.voucherNumber)
    .neq("id", params.posSaleId)
    .maybeSingle();

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo obtener la reserva local del comprobante POS: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    arcaStatus: data.arca_status ?? "not_requested",
    arcaRequestJson: (data.arca_request_json as Json | null) ?? null,
    arcaRequestedAt: data.arca_requested_at ?? null,
    arcaPointOfSale: data.arca_point_of_sale,
    arcaVoucherTypeCode: data.arca_voucher_type_code,
    arcaVoucherNumber: data.arca_voucher_number,
  };
}

async function releaseStalePosVoucherReservation(params: {
  orgId: string;
  reservation: PosVoucherReservationRow;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
}): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .update({
      arca_point_of_sale: null,
      arca_voucher_type_code: null,
      arca_voucher_number: null,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.reservation.id)
    .eq("arca_point_of_sale", params.pointOfSale)
    .eq("arca_voucher_type_code", params.voucherTypeCode)
    .eq("arca_voucher_number", params.voucherNumber)
    .in("arca_status", RELEASABLE_POS_VOUCHER_STATUSES)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo liberar la reserva local del comprobante POS: ${error.message}`
    );
  }

  return Boolean(data?.id);
}

async function recoverPosVoucherReservationConflict(params: {
  client: ArcaClient;
  orgId: string;
  posSaleId: string;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
}): Promise<"released" | "advance" | "blocked"> {
  const reservation = await getConflictingPosVoucherReservation(params);

  if (!reservation) {
    return "released";
  }

  const invoiceType = POS_VOUCHER_TYPE_TO_INVOICE_TYPE[params.voucherTypeCode];

  if (invoiceType) {
    const reconciled = await reconcileVoucherReservation({
      client: params.client,
      pointOfSale: params.pointOfSale,
      voucherTypeCode: params.voucherTypeCode,
      voucherNumber: params.voucherNumber,
    });

    if (reconciled) {
      await persistAuthorizedPosInvoice({
        orgId: params.orgId,
        posSaleId: reservation.id,
        invoiceType,
        pointOfSale: params.pointOfSale,
        voucherTypeCode: params.voucherTypeCode,
        voucherNumber: params.voucherNumber,
        authorization: reconciled.authorization,
        requestJson: reservation.arcaRequestJson ?? {},
        responseJson: reconciled.responseJson,
        idempotent: true,
      });

      return "advance";
    }
  }

  if (!isReleasablePosVoucherReservation(reservation)) {
    return "blocked";
  }

  return (await releaseStalePosVoucherReservation({
    orgId: params.orgId,
    reservation,
    pointOfSale: params.pointOfSale,
    voucherTypeCode: params.voucherTypeCode,
    voucherNumber: params.voucherNumber,
  }))
    ? "released"
    : "blocked";
}

async function persistAuthorizedPosInvoice(params: {
  orgId: string;
  posSaleId: string;
  invoiceType: PosArcaInvoiceType;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
  authorization: {
    CAE: string;
    CAEFchVto: string;
  };
  requestJson: Json;
  responseJson: Json;
  idempotent?: boolean;
}): Promise<ArcaSaleInvoiceResult> {
  const supabase = await createClient();
  const invoiceNumber = formatArcaInvoiceNumber(
    params.pointOfSale,
    params.voucherNumber
  );
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("pos_sales")
    .update({
      invoice_type: params.invoiceType,
      invoice_number: invoiceNumber,
      arca_status: "authorized",
      cae: params.authorization.CAE,
      cae_expiration_date: normalizeArcaExpirationTimestamp(
        params.authorization.CAEFchVto
      ),
      arca_authorized_at: now,
      arca_point_of_sale: params.pointOfSale,
      arca_voucher_number: params.voucherNumber,
      arca_voucher_type_code: params.voucherTypeCode,
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId)
    .select(
      "id, arca_status, invoice_number, cae, cae_expiration_date, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json"
    )
    .single();

  if (error || !data) {
    throw new ArcaConnectionError(
      `ARCA autorizó la factura POS, pero no se pudo persistir el resultado: ${error?.message ?? "sin respuesta"}`
    );
  }

  return toArcaSaleInvoiceResult(
    {
      id: data.id,
      arcaStatus: data.arca_status,
      invoiceNumber: data.invoice_number,
      cae: data.cae,
      caeExpirationDate: data.cae_expiration_date,
      arcaAuthorizedAt: data.arca_authorized_at,
      arcaPointOfSale: data.arca_point_of_sale,
      arcaVoucherNumber: data.arca_voucher_number,
      arcaVoucherTypeCode: data.arca_voucher_type_code,
      arcaLastError: data.arca_last_error,
      arcaRequestJson: (data.arca_request_json as Json | null) ?? null,
      arcaResponseJson: (data.arca_response_json as Json | null) ?? null,
    },
    {
      idempotent: params.idempotent ?? false,
    }
  );
}

async function persistPosInvoiceError(params: {
  orgId: string;
  posSaleId: string;
  requestJson: Json | null;
  responseJson: Json | null;
  errorMessage: string;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("pos_sales")
    .update({
      arca_status: "error",
      arca_last_error: params.errorMessage,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId)
    .neq("arca_status", "authorized");

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo guardar el error fiscal de la venta POS: ${error.message}`
    );
  }
}

async function persistRequestedPosInvoiceType(params: {
  orgId: string;
  posSaleId: string;
  invoiceType: PosArcaInvoiceType;
}) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("pos_sales")
    .update({
      invoice_type: params.invoiceType,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId)
    .neq("arca_status", "authorized");

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo guardar el tipo fiscal de la venta POS: ${error.message}`
    );
  }
}

async function getVoucherInfoResponseJson(params: {
  client: ArcaClient;
  authorization: PosAuthorization;
  pointOfSale: number;
  voucherTypeCode: number;
}): Promise<Json> {
  const voucherInfo = await getVoucherInfoWithTimeout({
    client: params.client,
    voucherNumber: params.authorization.voucherNumber,
    pointOfSale: params.pointOfSale,
    voucherTypeCode: params.voucherTypeCode,
  });

  return (
    toJsonValue({
      authorization: params.authorization,
      voucherInfo,
      voucherInfoPending: !voucherInfo,
    }) ?? {}
  );
}

function buildRequestJson(params: {
  sale: LoadedPosSale;
  invoiceType: PosArcaInvoiceType;
  request: ArcaPosVoucherRequest;
}): Json {
  return (
    toJsonValue({
      posSaleId: params.sale.id,
      invoiceType: params.invoiceType,
      customer: params.sale.customer
        ? {
            id: params.sale.customer.id,
            cuit: params.sale.customer.cuit,
          }
        : null,
      items: params.sale.items,
      taxes: params.sale.taxes,
      wsfeRequest: params.request,
    }) ?? {}
  );
}

async function reconcilePreviousReservation(params: {
  context: ValidatedPosSaleContext;
  client: ArcaClient;
}): Promise<ArcaSaleInvoiceResult | null> {
  const {
    arcaPointOfSale,
    arcaVoucherTypeCode,
    arcaVoucherNumber,
    arcaRequestJson,
  } = params.context.sale;

  if (!(arcaPointOfSale && arcaVoucherTypeCode && arcaVoucherNumber)) {
    return null;
  }

  const invoiceType = POS_VOUCHER_TYPE_TO_INVOICE_TYPE[arcaVoucherTypeCode];
  if (!invoiceType) {
    return null;
  }

  const reconciled = await reconcileVoucherReservation({
    client: params.client,
    pointOfSale: arcaPointOfSale,
    voucherTypeCode: arcaVoucherTypeCode,
    voucherNumber: arcaVoucherNumber,
  });

  if (!reconciled) {
    return null;
  }

  return persistAuthorizedPosInvoice({
    orgId: params.context.organizationId,
    posSaleId: params.context.sale.id,
    invoiceType,
    pointOfSale: arcaPointOfSale,
    voucherTypeCode: arcaVoucherTypeCode,
    voucherNumber: arcaVoucherNumber,
    authorization: reconciled.authorization,
    requestJson: arcaRequestJson ?? {},
    responseJson: reconciled.responseJson,
    idempotent: true,
  });
}

export function buildArcaVoucherRequestFromPosSale(
  context: PosArcaVoucherRequestContext
): ArcaPosVoucherRequest {
  return buildPosSaleVoucherRequest(context);
}

async function reserveAvailablePosVoucherNumber(params: {
  client: ArcaClient;
  context: ValidatedPosSaleContext;
  request: ArcaPosVoucherRequest;
  initialVoucherNumber: number;
}): Promise<{
  pendingSale: NonNullable<
    Awaited<ReturnType<typeof markPosSaleInvoicePending>>
  >;
  requestWithVoucher: ArcaPosVoucherRequest;
  requestJson: Json;
  voucherNumber: number;
}> {
  let voucherNumber = params.initialVoucherNumber;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const requestWithVoucher: ArcaPosVoucherRequest = {
      ...params.request,
      CbteDesde: voucherNumber,
      CbteHasta: voucherNumber,
    };
    const requestJson = buildRequestJson({
      sale: params.context.sale,
      invoiceType: params.context.invoiceType,
      request: requestWithVoucher,
    });

    try {
      const pendingSale = await markPosSaleInvoicePending({
        orgId: params.context.organizationId,
        posSaleId: params.context.sale.id,
        pointOfSale: params.request.PtoVta,
        voucherTypeCode: params.request.CbteTipo,
        voucherNumber,
        requestJson,
      });

      if (pendingSale?.id) {
        return {
          pendingSale,
          requestWithVoucher,
          requestJson,
          voucherNumber,
        };
      }

      throw new ArcaValidationError(
        "No se pudo iniciar la emisión fiscal porque la venta POS cambió de estado. Reintentá desde el detalle."
      );
    } catch (error) {
      if (!(error instanceof PosVoucherReservationConflictError)) {
        throw error;
      }

      const recovery = await recoverPosVoucherReservationConflict({
        client: params.client,
        orgId: params.context.organizationId,
        posSaleId: params.context.sale.id,
        pointOfSale: params.request.PtoVta,
        voucherTypeCode: params.request.CbteTipo,
        voucherNumber,
      });

      if (recovery === "released") {
        continue;
      }

      if (recovery === "advance") {
        voucherNumber += 1;
        continue;
      }

      throw new ArcaConnectionError(
        "El próximo número de comprobante POS ya está reservado por otra venta en curso. Reintentá la emisión desde el detalle de la venta."
      );
    }
  }

  throw new ArcaConnectionError(
    "No se pudo reservar un número de comprobante POS disponible. Reintentá la emisión desde el detalle de la venta."
  );
}

async function resolvePosVoucherReservation(params: {
  client: ArcaClient;
  context: ValidatedPosSaleContext;
  request: ArcaPosVoucherRequest;
  initialVoucherNumber: number;
}): Promise<{
  requestWithVoucher: ArcaPosVoucherRequest;
  requestJson: Json;
  voucherNumber: number;
}> {
  const existingVoucherNumber = params.context.sale.arcaVoucherNumber;

  if (
    params.context.sale.arcaStatus === "pending" &&
    params.context.sale.arcaPointOfSale === params.request.PtoVta &&
    params.context.sale.arcaVoucherTypeCode === params.request.CbteTipo &&
    existingVoucherNumber
  ) {
    const requestWithVoucher: ArcaPosVoucherRequest = {
      ...params.request,
      CbteDesde: existingVoucherNumber,
      CbteHasta: existingVoucherNumber,
    };

    return {
      requestWithVoucher,
      requestJson: buildRequestJson({
        sale: params.context.sale,
        invoiceType: params.context.invoiceType,
        request: requestWithVoucher,
      }),
      voucherNumber: existingVoucherNumber,
    };
  }

  return await reserveAvailablePosVoucherNumber(params);
}

export async function emitPosSaleInvoice(params: {
  orgSlug: string;
  posSaleId: string;
  invoiceType: string;
}): Promise<ArcaSaleInvoiceResult> {
  const invoiceType = assertPosInvoiceType(params.invoiceType);
  const validation = await validatePosSaleForArcaInvoicing({
    orgSlug: params.orgSlug,
    posSaleId: params.posSaleId,
    invoiceType,
  });

  if (validation.kind === "already_authorized") {
    return validation.result;
  }

  const { context } = validation;
  await persistRequestedPosInvoiceType({
    orgId: context.organizationId,
    posSaleId: context.sale.id,
    invoiceType: context.invoiceType,
  });

  const client = createArcaClientFromCredentials({
    cuit: context.organizationCuit,
    cert: context.resolvedCredentials.cert,
    key: context.resolvedCredentials.key,
    environment: context.resolvedCredentials.environment,
  });

  const previousReservation = await reconcilePreviousReservation({
    context,
    client,
  });

  if (previousReservation) {
    return previousReservation;
  }

  const request = buildPosSaleVoucherRequest({
    sale: context.sale,
    invoiceType: context.invoiceType,
    pointOfSale: context.resolvedCredentials.pointOfSale,
  });

  if (!SUPPORTED_POS_INVOICE_TYPES.has(context.invoiceType)) {
    throw new ArcaValidationError(
      "La venta POS solo puede emitirse como Factura B o Factura C."
    );
  }

  let voucherNumber: number;

  try {
    const lastVoucher = await client.ElectronicBilling.getLastVoucher(
      request.PtoVta,
      request.CbteTipo
    );
    const normalizedLastVoucher = Number(lastVoucher);

    if (!Number.isFinite(normalizedLastVoucher)) {
      throw new Error("ARCA devolvió un último comprobante inválido.");
    }

    voucherNumber = normalizedLastVoucher + 1;
  } catch (error) {
    const errorMessage =
      sanitizeArcaErrorMessage(error) ||
      "No se pudo obtener el último comprobante autorizado en ARCA.";
    const requestJson = buildRequestJson({
      sale: context.sale,
      invoiceType: context.invoiceType,
      request,
    });

    await persistPosInvoiceError({
      orgId: context.organizationId,
      posSaleId: context.sale.id,
      requestJson,
      responseJson: toJsonValue({
        stage: "FECompUltimoAutorizado",
        error: errorMessage,
      }),
      errorMessage,
    });

    throw new ArcaConnectionError(errorMessage);
  }

  const reservation = await resolvePosVoucherReservation({
    client,
    context,
    request,
    initialVoucherNumber: voucherNumber,
  });
  const { requestWithVoucher, requestJson: reservedRequestJson } = reservation;
  voucherNumber = reservation.voucherNumber;

  let responseJson: Json | null = null;

  try {
    const rawAuthorization =
      await client.ElectronicBilling.createVoucher(requestWithVoucher);
    const authorization: PosAuthorization = {
      CAE: String(rawAuthorization.CAE),
      CAEFchVto: String(rawAuthorization.CAEFchVto),
      voucherNumber,
    };
    responseJson = await getVoucherInfoResponseJson({
      client,
      authorization,
      pointOfSale: request.PtoVta,
      voucherTypeCode: request.CbteTipo,
    });

    return persistAuthorizedPosInvoice({
      orgId: context.organizationId,
      posSaleId: context.sale.id,
      invoiceType: context.invoiceType,
      pointOfSale: request.PtoVta,
      voucherTypeCode: request.CbteTipo,
      voucherNumber,
      authorization,
      requestJson: reservedRequestJson,
      responseJson,
    });
  } catch (error) {
    const reconciled = await reconcileVoucherReservation({
      client,
      pointOfSale: request.PtoVta,
      voucherTypeCode: request.CbteTipo,
      voucherNumber,
    });

    if (reconciled) {
      return persistAuthorizedPosInvoice({
        orgId: context.organizationId,
        posSaleId: context.sale.id,
        invoiceType: context.invoiceType,
        pointOfSale: request.PtoVta,
        voucherTypeCode: request.CbteTipo,
        voucherNumber,
        authorization: reconciled.authorization,
        requestJson: reservedRequestJson,
        responseJson: reconciled.responseJson,
      });
    }

    const sanitizedError = sanitizeArcaErrorMessage(error);
    const errorMessage =
      sanitizedError || "No se pudo completar la emisión fiscal POS en ARCA.";

    responseJson =
      responseJson ??
      toJsonValue({
        authorization: null,
        reconciliationPending: true,
        error: errorMessage,
      });

    await persistPosInvoiceError({
      orgId: context.organizationId,
      posSaleId: context.sale.id,
      requestJson: reservedRequestJson,
      responseJson,
      errorMessage,
    });

    throw new ArcaConnectionError(errorMessage);
  }
}
