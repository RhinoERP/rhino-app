import "server-only";

import { formalizarEntry } from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { normalizeCustomerTaxCondition } from "@/modules/customers/tax-conditions";
import { sendSaleInvoiceEmail } from "@/modules/email/service/send-sale-invoice-email";
import { regenerateChildOrderRemitos } from "@/modules/orders/server/regenerate-order-remitos.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import {
  isArcaSupportedInvoiceType,
  isFacturaAInvoiceType,
} from "@/modules/sales/invoice-type-utils";
import {
  canIssueArcaInvoiceForPreventa,
  isArcaInvoiceEligibleSaleStatus,
} from "@/modules/sales/preventa-invoicing";
import { regenerateAuthorizedSaleRemittances } from "@/modules/sales/remittance-regeneration";
import {
  ensureReceivableForAuthorizedPreventaInvoice,
  regenerateSaleLevelRemito,
} from "@/modules/sales/service/sales.service";
import type { Database, Json } from "@/types/supabase";
import { formatDateToArcaDateNumber } from "../arca-qr";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import {
  type ArcaCurrencyQuoteClient,
  type AuthorizedArcaFiscalCurrency,
  buildArcaCurrencyRequestFields,
  buildInvoiceFiscalCurrency,
  resolveArcaFiscalCurrency,
} from "../fiscal-currency";
import { buildArcaReceiverDocument } from "../receiver-document";
import { mapCustomerTaxConditionToArcaReceiverVatConditionId } from "../receiver-tax-conditions";
import {
  ARCA_TAX_CODE_METADATA,
  type ArcaTaxCode,
  normalizeArcaTaxCode,
} from "../tax-codes";
import type {
  ArcaSaleInvoiceReadiness,
  ArcaSaleInvoiceResult,
  ArcaSaleInvoiceValidationResult,
} from "../types";
import { normalizeCuit, validateOrganizationCuit } from "../validation";
import {
  assertCanIssueOrganizationArca,
  getCurrentUserOrganizationArcaAccess,
} from "./access";
import {
  createArcaClientFromCredentials,
  isArcaCertificateExpired,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import {
  getOrganizationArcaDelegationByOrganizationIdAndEnvironment,
  getOrganizationArcaSettingsByOrganizationId,
} from "./repository";
import {
  mapArcaSummary,
  toArcaInvoiceAAuthorizationType,
  toArcaStatus,
} from "./settings.service";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];
type OrderStatus = Database["public"]["Enums"]["order_status"];

type LoadedSaleTax = {
  id: string;
  taxId: string;
  name: string;
  rate: number;
  taxAmount: number;
  baseAmount: number;
  taxCodeSnapshot: string | null;
  currentTaxCode: string | null;
};

type LoadedSaleItem = {
  id: string;
  productId: string | null;
  description: string | null;
  quantity: number;
  unitQuantity: number | null;
  unitPrice: number;
  basePrice: number;
  discountAmount: number | null;
  discountPercentage: number | null;
  subtotal: number;
};

type LoadedSale = {
  id: string;
  organizationId: string;
  status: OrderStatus;
  saleDate: string;
  expirationDate: string | null;
  creditDays: number | null;
  invoiceType: InvoiceType;
  invoiceNumber: string | null;
  subTotal: number | null;
  totalAmount: number;
  currency: string;
  totalTaxAmount: number | null;
  globalDiscountAmount: number | null;
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
  customer: {
    id: string;
    businessName: string;
    fantasyName: string | null;
    cuit: string | null;
    taxCondition: string | null;
  };
  items: LoadedSaleItem[];
  taxes: LoadedSaleTax[];
};

type LoadedSaleQueryRecord = {
  id: string;
  organization_id: string;
  status: OrderStatus;
  sale_date: string;
  expiration_date: string | null;
  credit_days: number | null;
  invoice_type: InvoiceType;
  invoice_number: string | null;
  sub_total: number | null;
  total_amount: number;
  currency: string | null;
  total_tax_amount: number | null;
  global_discount_amount: number | null;
  arca_status: string;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Json | null;
  arca_response_json: Json | null;
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    cuit: string | null;
    tax_condition: string | null;
  } | null;
  items: Array<{
    id: string;
    product_id: string | null;
    description: string | null;
    quantity: number;
    unit_quantity: number | null;
    unit_price: number;
    base_price: number;
    discount_amount: number | null;
    discount_percentage: number | null;
    subtotal: number;
  }> | null;
  taxes: Array<{
    id: string;
    tax_id: string;
    name: string;
    rate: number;
    tax_amount: number;
    base_amount: number;
    tax_code_snapshot: string | null;
    tax?: {
      code: string | null;
    } | null;
  }> | null;
};

type PersistedAuthorizedSale = {
  id: string;
  arca_status: string;
  invoice_number: string | null;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Json | null;
  arca_response_json: Json | null;
};

type ValidatedSaleContext = {
  orgSlug: string;
  organizationId: string;
  organizationCuit: string;
  resolvedCredentials: Awaited<
    ReturnType<typeof resolveArcaOrganizationCredentials>
  >;
  sale: LoadedSale;
  effectiveInvoiceType: InvoiceType;
};

type TaxClassification =
  | {
      kind: "iva";
      code: ArcaTaxCode;
      arcaId: number;
    }
  | {
      kind: "tributo";
      code: ArcaTaxCode;
      arcaId: number;
    };

type ArcaVoucherRequest = {
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
  CanMisMonExt?: "S";
  PtoVta: number;
  CbteTipo: number;
  Iva?: Array<{
    Id: number;
    BaseImp: number;
    Importe: number;
  }>;
  Tributos?: Array<{
    Id: number;
    Desc: string;
    BaseImp: number;
    Alic: number;
    Importe: number;
  }>;
};

const ARCA_VOUCHER_TYPE_MAP: Partial<Record<InvoiceType, number>> = {
  FACTURA_A: 1,
  FACTURA_A_RETENCION: 51,
  FACTURA_B: 6,
  FACTURA_C: 11,
};

const TAXPAYER_CUIT_REGEX = /^\d{11}$/;
const ARCA_VOUCHER_INFO_TIMEOUT_MS = 4000;

function hasValidOrganizationCuit(cuit: string | null | undefined): boolean {
  try {
    validateOrganizationCuit(cuit);
    return true;
  } catch {
    return false;
  }
}

async function getVoucherInfoBestEffort(params: {
  client: ReturnType<typeof createArcaClientFromCredentials>;
  voucherNumber: number;
  pointOfSale: number;
  voucherTypeCode: number;
  authorization: {
    CAE: string;
    CAEFchVto: string;
    voucherNumber: number;
  };
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
  } catch (voucherInfoError) {
    return toJsonValue({
      authorization: params.authorization,
      voucherInfoError: sanitizeArcaErrorMessage(voucherInfoError),
    });
  }
}

function normalizeLinkedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function sanitizeCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeTaxpayerCuit(
  cuit: string | null | undefined,
  label: string
): string {
  if (!cuit?.trim()) {
    throw new ArcaValidationError(`El ${label} no tiene CUIT informado.`);
  }

  const normalized = normalizeCuit(cuit);

  if (!TAXPAYER_CUIT_REGEX.test(normalized)) {
    throw new ArcaValidationError(
      `El CUIT del ${label} no tiene un formato válido.`
    );
  }

  return normalized;
}

function toArcaSaleInvoiceResult(
  sale: Pick<
    LoadedSale,
    | "id"
    | "arcaStatus"
    | "invoiceNumber"
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
): ArcaSaleInvoiceResult {
  return {
    saleId: sale.id,
    status:
      sale.arcaStatus === "pending" ||
      sale.arcaStatus === "authorized" ||
      sale.arcaStatus === "error"
        ? sale.arcaStatus
        : "not_requested",
    invoiceNumber: sale.invoiceNumber,
    cae: sale.arcaCae,
    caeExpiresAt: sale.arcaCaeExpiresAt,
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

function getCurrentArcaDateNumber(): number {
  try {
    return formatDateToArcaDateNumber(new Date());
  } catch {
    throw new ArcaValidationError(
      "No se pudo derivar la fecha fiscal de emisión para ARCA."
    );
  }
}

function toArcaTimestamp(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00.000Z`).toISOString();
}

function assertSupportedInvoiceType(invoiceType: InvoiceType): number {
  const voucherType = ARCA_VOUCHER_TYPE_MAP[invoiceType];

  if (voucherType) {
    return voucherType;
  }

  if (invoiceType === "NOTA_DE_VENTA") {
    throw new ArcaValidationError(
      "Seleccioná un tipo de comprobante fiscal válido antes de emitir la factura."
    );
  }

  if (invoiceType === "FACTURA_E") {
    throw new ArcaValidationError(
      "FACTURA_E todavía no está soportada en esta fase de ARCA."
    );
  }

  throw new ArcaValidationError(
    `El tipo de comprobante ${invoiceType} todavía no está soportado en esta fase de ARCA.`
  );
}

function resolveEffectiveArcaInvoiceType(params: {
  invoiceType: InvoiceType;
  invoiceAAuthorizationType: string | null | undefined;
}): InvoiceType {
  const invoiceAAuthorizationType = toArcaInvoiceAAuthorizationType(
    params.invoiceAAuthorizationType
  );

  if (
    params.invoiceType === "FACTURA_A" &&
    invoiceAAuthorizationType === "operation_subject_to_withholding"
  ) {
    return "FACTURA_A_RETENCION";
  }

  return params.invoiceType;
}

function toTaxClassification(code: ArcaTaxCode): TaxClassification {
  const metadata = ARCA_TAX_CODE_METADATA[code];

  return {
    kind: metadata.kind,
    code,
    arcaId: metadata.arcaId,
  };
}

function resolveTaxCode(tax: LoadedSaleTax): ArcaTaxCode {
  const snapshotCode = sanitizeCode(tax.taxCodeSnapshot);
  const currentCode = sanitizeCode(tax.currentTaxCode);

  if (!(snapshotCode || currentCode)) {
    throw new ArcaValidationError(
      `El impuesto "${tax.name}" no tiene un código fiscal reconocido para ARCA.`
    );
  }

  const resolvedSnapshotCode = snapshotCode
    ? normalizeArcaTaxCode(snapshotCode)
    : null;
  if (resolvedSnapshotCode) {
    return resolvedSnapshotCode;
  }

  const resolvedCurrentCode = currentCode
    ? normalizeArcaTaxCode(currentCode)
    : null;
  if (resolvedCurrentCode) {
    return resolvedCurrentCode;
  }

  const unsupportedCode = snapshotCode ?? currentCode;

  throw new ArcaValidationError(
    `El impuesto "${tax.name}" usa el código "${unsupportedCode}", que todavía no está soportado en esta fase de ARCA.`
  );
}

function classifySaleTaxes(sale: LoadedSale) {
  const classifiedTaxes = sale.taxes.map((tax) => {
    const code = resolveTaxCode(tax);
    return {
      ...tax,
      classification: toTaxClassification(code),
      resolvedCode: code,
    };
  });

  const ivaTaxes = classifiedTaxes.filter(
    (tax) => tax.classification.kind === "iva"
  );
  const tributeTaxes = classifiedTaxes.filter(
    (tax) => tax.classification.kind === "tributo"
  );

  return { ivaTaxes, tributeTaxes };
}

function normalizeLoadedSaleItem(item: {
  id?: string | null;
  product_id?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit_quantity?: number | null;
  unit_price?: number | null;
  base_price?: number | null;
  discount_amount?: number | null;
  discount_percentage?: number | null;
  subtotal?: number | null;
}): LoadedSaleItem {
  return {
    id: item.id ?? "",
    productId: item.product_id ?? null,
    description: item.description ?? null,
    quantity: Number(item.quantity ?? 0),
    unitQuantity:
      item.unit_quantity !== null && item.unit_quantity !== undefined
        ? Number(item.unit_quantity)
        : null,
    unitPrice: truncateMoney(Number(item.unit_price ?? 0)),
    basePrice: truncateMoney(Number(item.base_price ?? item.unit_price ?? 0)),
    discountAmount:
      item.discount_amount !== null && item.discount_amount !== undefined
        ? truncateMoney(Number(item.discount_amount))
        : null,
    discountPercentage:
      item.discount_percentage !== null &&
      item.discount_percentage !== undefined
        ? Number(item.discount_percentage)
        : null,
    subtotal: truncateMoney(Number(item.subtotal ?? 0)),
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
}): LoadedSaleTax {
  const currentTax = normalizeLinkedRow(
    item.tax as
      | {
          code?: string | null;
        }
      | Array<{
          code?: string | null;
        }>
      | null
  );

  return {
    id: item.id ?? "",
    taxId: item.tax_id ?? "",
    name: item.name ?? "",
    rate: Number(item.rate ?? 0),
    taxAmount: truncateMoney(Number(item.tax_amount ?? 0)),
    baseAmount: truncateMoney(Number(item.base_amount ?? 0)),
    taxCodeSnapshot: sanitizeCode(item.tax_code_snapshot) ?? null,
    currentTaxCode: sanitizeCode(currentTax?.code) ?? null,
  };
}

function toNullableMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return truncateMoney(Number(value));
}

function normalizeLoadedSaleCustomer(
  value:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }>
    | null
): LoadedSale["customer"] {
  const customer = normalizeLinkedRow(value);
  if (!customer?.id) {
    throw new ArcaValidationError(
      "La venta no tiene un cliente válido asociado."
    );
  }

  return {
    id: customer.id,
    businessName: customer.business_name ?? "Cliente desconocido",
    fantasyName: customer.fantasy_name ?? null,
    cuit: customer.cuit ?? null,
    taxCondition: customer.tax_condition ?? null,
  };
}

function normalizeLoadedSaleArcaState(data: {
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
  };
}

function normalizeLoadedSale(data: {
  id: string;
  organization_id: string;
  status: OrderStatus;
  sale_date: string;
  expiration_date: string | null;
  credit_days: number | null;
  invoice_type: InvoiceType;
  invoice_number: string | null;
  sub_total: number | null;
  total_amount: number;
  currency: string | null;
  total_tax_amount: number | null;
  global_discount_amount: number | null;
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
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        tax_condition?: string | null;
      }>
    | null;
  items?: Array<{
    id?: string | null;
    product_id?: string | null;
    description?: string | null;
    quantity?: number | null;
    unit_quantity?: number | null;
    unit_price?: number | null;
    base_price?: number | null;
    discount_amount?: number | null;
    discount_percentage?: number | null;
    subtotal?: number | null;
  }> | null;
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
  return {
    id: data.id,
    organizationId: data.organization_id,
    status: data.status,
    saleDate: data.sale_date,
    expirationDate: data.expiration_date,
    creditDays: data.credit_days,
    invoiceType: data.invoice_type,
    invoiceNumber: data.invoice_number,
    subTotal: toNullableMoney(data.sub_total),
    totalAmount: truncateMoney(Number(data.total_amount ?? 0)),
    currency: data.currency ?? "ARS",
    totalTaxAmount: toNullableMoney(data.total_tax_amount),
    globalDiscountAmount: toNullableMoney(data.global_discount_amount),
    ...normalizeLoadedSaleArcaState(data),
    customer: normalizeLoadedSaleCustomer(data.customer),
    items: (data.items ?? []).map(normalizeLoadedSaleItem),
    taxes: (data.taxes ?? []).map(normalizeLoadedSaleTax),
  };
}

async function loadSaleForArcaInvoicing(params: {
  orgSlug: string;
  saleId: string;
}): Promise<{
  organizationId: string;
  organizationCuit: string | null;
  sale: LoadedSale;
}> {
  const access = await getCurrentUserOrganizationArcaAccess(params.orgSlug);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      `
        id,
        organization_id,
        status,
        sale_date,
        expiration_date,
        credit_days,
        invoice_type,
        invoice_number,
        sub_total,
        total_amount,
        currency,
        total_tax_amount,
        global_discount_amount,
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
        customer:customers(
          id,
          business_name,
          fantasy_name,
          cuit,
          tax_condition
        ),
        items:sales_order_items(
          id,
          product_id,
          description,
          quantity,
          unit_quantity,
          unit_price,
          base_price,
          discount_amount,
          discount_percentage,
          subtotal
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
    .eq("id", params.saleId)
    .maybeSingle();

  if (error) {
    throw new ArcaValidationError(
      `No se pudo obtener la venta para emitir en ARCA: ${error.message}`
    );
  }

  if (!data) {
    throw new ArcaValidationError("Venta no encontrada.");
  }

  const saleData = data as LoadedSaleQueryRecord;

  return {
    organizationId: access.organization.id,
    organizationCuit: access.organization.cuit ?? null,
    sale: normalizeLoadedSale({
      id: saleData.id,
      organization_id: saleData.organization_id,
      status: saleData.status,
      sale_date: saleData.sale_date,
      expiration_date: saleData.expiration_date,
      credit_days: saleData.credit_days,
      invoice_type: saleData.invoice_type,
      invoice_number: saleData.invoice_number,
      sub_total: saleData.sub_total,
      total_amount: saleData.total_amount,
      currency: saleData.currency,
      total_tax_amount: saleData.total_tax_amount,
      global_discount_amount: saleData.global_discount_amount,
      arca_status: saleData.arca_status,
      arca_cae: saleData.arca_cae,
      arca_cae_expires_at: saleData.arca_cae_expires_at,
      arca_authorized_at: saleData.arca_authorized_at,
      arca_point_of_sale: saleData.arca_point_of_sale,
      arca_voucher_number: saleData.arca_voucher_number,
      arca_voucher_type_code: saleData.arca_voucher_type_code,
      arca_last_error: saleData.arca_last_error,
      arca_request_json: saleData.arca_request_json ?? null,
      arca_response_json: saleData.arca_response_json ?? null,
      customer: saleData.customer,
      items: saleData.items,
      taxes: saleData.taxes,
    }),
  };
}

export async function getArcaSaleInvoiceReadiness(
  orgSlug: string
): Promise<ArcaSaleInvoiceReadiness> {
  const access = await getCurrentUserOrganizationArcaAccess(orgSlug);
  const settings = await getOrganizationArcaSettingsByOrganizationId(
    access.organization.id,
    "system"
  );
  const rawDelegation =
    settings?.mode === "delegated" && settings.environment
      ? await getOrganizationArcaDelegationByOrganizationIdAndEnvironment(
          access.organization.id,
          settings.environment === "prod" ? "prod" : "dev",
          "system"
        )
      : null;
  let summary = mapArcaSummary({
    organizationCuit: access.organization.cuit ?? null,
    settings,
    delegation: rawDelegation,
  });

  if (settings) {
    try {
      const resolved = await resolveArcaOrganizationCredentials({
        organizationId: access.organization.id,
        organizationCuit: access.organization.cuit,
        actor: "system",
      });
      summary = mapArcaSummary({
        organizationCuit: access.organization.cuit ?? null,
        settings: resolved.settings,
        operatorProfile: resolved.operatorProfile,
        delegation: resolved.delegation,
      });
    } catch {
      // Keep the raw summary so the UI can still show current persisted status.
    }
  }

  const isActive = Boolean(
    summary.isConfigured &&
      summary.hasCredentials &&
      summary.pointOfSale &&
      summary.status === "connected" &&
      (!summary.usesDelegatedCredentials ||
        summary.delegation?.status === "connected") &&
      hasValidOrganizationCuit(summary.organizationCuit) &&
      !isArcaCertificateExpired(summary.certExpiresAt)
  );

  return {
    ...summary,
    canManageSettings: access.canManage,
    isActive,
  };
}

export function formatArcaInvoiceNumber(
  pointOfSale: number,
  voucherNumber: number
): string {
  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

export function mapInvoiceTypeToArcaVoucherType(
  invoiceType: InvoiceType
): number {
  return assertSupportedInvoiceType(invoiceType);
}

export async function validateSaleForArcaInvoicing(params: {
  orgSlug: string;
  saleId: string;
}): Promise<
  ArcaSaleInvoiceValidationResult & { context?: ValidatedSaleContext }
> {
  const { organizationId, organizationCuit, sale } =
    await loadSaleForArcaInvoicing(params);

  if (sale.arcaStatus === "authorized") {
    if (sale.status === "DRAFT") {
      await ensureReceivableForAuthorizedPreventaInvoice({
        supabase: await createClient(),
        orgId: organizationId,
        saleId: sale.id,
        customerId: sale.customer.id,
        totalAmount: sale.totalAmount,
        currency: sale.currency,
        saleDate: sale.saleDate,
        expirationDate: sale.expirationDate,
        creditDays: sale.creditDays,
      });
    }

    return {
      kind: "already_authorized",
      result: toArcaSaleInvoiceResult(sale, {
        idempotent: true,
      }),
    };
  }

  if (sale.arcaStatus === "pending") {
    throw new ArcaValidationError(
      "Ya hay una emisión fiscal en curso para esta venta. Esperá unos segundos e intentá nuevamente."
    );
  }

  let allowPreventaInvoicing = false;
  if (sale.status === "DRAFT") {
    const orgSettings = await getOrgSettings(params.orgSlug);
    allowPreventaInvoicing = orgSettings.allow_preventa_arca_invoicing;
    if (!canIssueArcaInvoiceForPreventa(sale.status, allowPreventaInvoicing)) {
      throw new ArcaValidationError(
        "No se puede emitir ARCA para una preventa en borrador porque esta organización no habilitó la facturación previa a la confirmación."
      );
    }
  }

  if (sale.status === "CANCELLED") {
    throw new ArcaValidationError(
      "No se puede emitir ARCA para una venta cancelada."
    );
  }

  if (!isArcaInvoiceEligibleSaleStatus(sale.status, allowPreventaInvoicing)) {
    throw new ArcaValidationError(
      "La venta no está en un estado válido para emitir ARCA."
    );
  }

  if (sanitizeArcaManualInvoiceNumberConflict(sale)) {
    throw new ArcaValidationError(
      "La venta ya tiene un número de comprobante manual. Revisalo antes de emitir la factura fiscal."
    );
  }

  if (sale.items.length === 0) {
    throw new ArcaValidationError(
      "La venta no tiene un detalle persistido válido para emitir en ARCA."
    );
  }

  if (!isArcaSupportedInvoiceType(sale.invoiceType)) {
    assertSupportedInvoiceType(sale.invoiceType);
  }
  normalizeTaxpayerCuit(sale.customer.cuit, "cliente");

  if (!sale.customer.taxCondition?.trim()) {
    throw new ArcaValidationError(
      "El cliente no tiene condición fiscal informada."
    );
  }

  validateSaleCustomerVoucherCompatibility(sale);

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

  const effectiveInvoiceType = validateSaleInvoiceTypeAgainstArcaSettings({
    sale,
    invoiceAAuthorizationType:
      resolvedCredentials.settings.invoice_a_authorization_type,
  });
  assertSupportedInvoiceType(effectiveInvoiceType);

  const validatedOrganizationCuit = validateOrganizationCuit(organizationCuit);

  return {
    kind: "ready",
    saleId: sale.id,
    organizationId,
    orgSlug: params.orgSlug,
    context: {
      orgSlug: params.orgSlug,
      organizationId,
      organizationCuit: validatedOrganizationCuit,
      resolvedCredentials,
      sale,
      effectiveInvoiceType,
    },
  };
}

function sanitizeArcaManualInvoiceNumberConflict(sale: LoadedSale): boolean {
  return Boolean(sale.invoiceNumber?.trim());
}

function validateSaleCustomerVoucherCompatibility(sale: LoadedSale): void {
  const normalizedTaxCondition = normalizeCustomerTaxCondition(
    sale.customer.taxCondition
  );

  if (
    sale.invoiceType === "FACTURA_B" &&
    normalizedTaxCondition === "RESPONSABLE_INSCRIPTO"
  ) {
    throw new ArcaValidationError(
      "No se puede emitir Factura B para un cliente Responsable Inscripto. Revisá la condición fiscal del cliente o emití un comprobante compatible."
    );
  }
}

function validateSaleInvoiceTypeAgainstArcaSettings(params: {
  sale: LoadedSale;
  invoiceAAuthorizationType: string | null | undefined;
}): InvoiceType {
  const invoiceAAuthorizationType = toArcaInvoiceAAuthorizationType(
    params.invoiceAAuthorizationType
  );
  const effectiveInvoiceType = resolveEffectiveArcaInvoiceType({
    invoiceType: params.sale.invoiceType,
    invoiceAAuthorizationType,
  });

  if (
    params.sale.invoiceType === "FACTURA_A_RETENCION" &&
    invoiceAAuthorizationType !== "operation_subject_to_withholding"
  ) {
    throw new ArcaValidationError(
      "La venta está marcada como Factura A con leyenda operación sujeta a retención, pero la configuración ARCA de la organización no tiene esa habilitación activa."
    );
  }

  return effectiveInvoiceType;
}

function mapArcaEmissionErrorMessage(params: {
  errorMessage: string | null;
  sale: LoadedSale;
  effectiveInvoiceType: InvoiceType;
}): string | null {
  const message = params.errorMessage?.trim() ?? null;

  if (!message) {
    return null;
  }

  if (
    isFacturaAInvoiceType(params.effectiveInvoiceType) &&
    message.includes("(10000)") &&
    message.includes("CLASE 'A'")
  ) {
    return params.effectiveInvoiceType === "FACTURA_A_RETENCION"
      ? "ARCA rechazó la Factura A con leyenda operación sujeta a retención para este CUIT emisor. Revisá que la organización esté habilitada para ese comprobante en el ambiente y punto de venta configurados."
      : "ARCA rechazó la Factura A para este CUIT emisor. La configuración fiscal activa del emisor no está habilitada para emitir comprobantes clase A en este ambiente o punto de venta.";
  }

  if (
    params.sale.invoiceType === "FACTURA_B" &&
    message.includes("(10243)") &&
    message.includes("Condicion IVA receptor")
  ) {
    return "ARCA rechazó la Factura B porque la condición IVA del cliente no es compatible con ese comprobante. Revisá la condición fiscal del cliente o emití un comprobante compatible.";
  }

  return message;
}

export function buildArcaVoucherRequestFromSale(
  context: ValidatedSaleContext,
  fiscalCurrency: AuthorizedArcaFiscalCurrency
): ArcaVoucherRequest {
  const receiverDocument = buildArcaReceiverDocument({
    customerCuit: context.sale.customer.cuit,
    customerTaxCondition: context.sale.customer.taxCondition,
    invoiceType: context.effectiveInvoiceType,
    totalAmount: context.sale.totalAmount,
  });
  const receiverVatConditionId =
    mapCustomerTaxConditionToArcaReceiverVatConditionId(
      context.sale.customer.taxCondition
    );
  const voucherTypeCode = mapInvoiceTypeToArcaVoucherType(
    context.effectiveInvoiceType
  );
  const { ivaTaxes, tributeTaxes } = classifySaleTaxes(context.sale);

  const tributeAmount = truncateMoney(
    tributeTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );
  const ivaAmount = truncateMoney(
    ivaTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );

  let taxableBase = 0;

  if (ivaTaxes.length > 0) {
    taxableBase = truncateMoney(
      ivaTaxes.reduce((total, tax) => total + tax.baseAmount, 0)
    );
  } else if (tributeTaxes.length > 0) {
    taxableBase = truncateMoney(context.sale.totalAmount - tributeAmount);
  } else {
    taxableBase = truncateMoney(context.sale.totalAmount);
  }

  if (!Number.isFinite(taxableBase) || taxableBase < 0) {
    throw new ArcaValidationError(
      "No se pudo derivar la base imponible fiscal de la venta."
    );
  }

  const expectedTotal = truncateMoney(taxableBase + ivaAmount + tributeAmount);
  if (Math.abs(expectedTotal - context.sale.totalAmount) > 0.01) {
    throw new ArcaValidationError(
      "La venta no tiene un snapshot fiscal consistente para derivar ImpNeto en ARCA."
    );
  }

  return {
    Concepto: 1,
    DocTipo: receiverDocument.documentType,
    DocNro: receiverDocument.documentNumber,
    CondicionIVAReceptorId: receiverVatConditionId,
    CbteFch: getCurrentArcaDateNumber(),
    ImpTotal: truncateMoney(context.sale.totalAmount),
    ImpTotConc: 0,
    ImpNeto: taxableBase,
    ImpOpEx: 0,
    ImpIVA: ivaAmount,
    ImpTrib: tributeAmount,
    ...buildArcaCurrencyRequestFields(fiscalCurrency),
    PtoVta: context.resolvedCredentials.pointOfSale,
    CbteTipo: voucherTypeCode,
    ...(ivaTaxes.length > 0
      ? {
          Iva: ivaTaxes.map((tax) => ({
            Id: tax.classification.arcaId,
            BaseImp: truncateMoney(tax.baseAmount),
            Importe: truncateMoney(tax.taxAmount),
          })),
        }
      : {}),
    ...(tributeTaxes.length > 0
      ? {
          Tributos: tributeTaxes.map((tax) => ({
            Id: tax.classification.arcaId,
            Desc: tax.name,
            BaseImp: truncateMoney(tax.baseAmount),
            Alic: truncateMoney(tax.rate),
            Importe: truncateMoney(tax.taxAmount),
          })),
        }
      : {}),
  };
}

function persistFiscalCurrencySnapshot(params: {
  requestJson: Json;
  request: ArcaVoucherRequest;
}): Json {
  return (toJsonValue({
    ...(params.requestJson as Record<string, Json>),
    fiscalCurrency: {
      code: params.request.MonId,
      rate: params.request.MonCotiz,
      sameCurrencySettlement: params.request.CanMisMonExt === "S",
    },
  }) ?? {}) as Json;
}

async function markSaleInvoicePending(params: {
  orgId: string;
  saleId: string;
  requestJson: Json;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_orders")
    .update({
      arca_status: "pending",
      arca_last_error: null,
      arca_request_json: params.requestJson,
      arca_response_json: null,
      updated_at: now,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.saleId)
    .in("arca_status", ["not_requested", "error"])
    .select(
      "id, arca_status, invoice_number, arca_cae, arca_cae_expires_at, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json"
    )
    .maybeSingle();

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo bloquear la venta para emitir en ARCA: ${error.message}`
    );
  }

  return data;
}

async function persistAuthorizedInvoice(params: {
  orgId: string;
  saleId: string;
  invoiceType: InvoiceType;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
  authorization: {
    CAE: string;
    CAEFchVto: string;
  };
  requestJson: Json;
  responseJson: Json;
  preventaSale?: LoadedSale;
}): Promise<ArcaSaleInvoiceResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const invoiceNumber = formatArcaInvoiceNumber(
    params.pointOfSale,
    params.voucherNumber
  );

  const { data, error } = await supabase
    .from("sales_orders")
    .update({
      invoice_type: params.invoiceType,
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
      invoice_number: invoiceNumber,
      updated_at: now,
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.saleId)
    .select(
      "id, arca_status, invoice_number, arca_cae, arca_cae_expires_at, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_last_error, arca_request_json, arca_response_json"
    )
    .single();

  if (error || !data) {
    throw new ArcaConnectionError(
      `ARCA autorizó la factura, pero no se pudo persistir el resultado: ${error?.message ?? "sin respuesta"}`
    );
  }

  const persistedSale = data as PersistedAuthorizedSale;

  if (params.preventaSale) {
    await ensureReceivableForAuthorizedPreventaInvoice({
      supabase,
      orgId: params.orgId,
      saleId: params.saleId,
      customerId: params.preventaSale.customer.id,
      totalAmount: params.preventaSale.totalAmount,
      currency: params.preventaSale.currency,
      saleDate: params.preventaSale.saleDate,
      expirationDate: params.preventaSale.expirationDate,
      creditDays: params.preventaSale.creditDays,
    });
  }

  const { data: accountingLink } = await supabase
    .from("sales_orders" as never)
    .select("accounting_informal_entry_id")
    .eq("organization_id", params.orgId)
    .eq("id", params.saleId)
    .maybeSingle();

  const accountingInformalEntryId = (
    accountingLink as {
      accounting_informal_entry_id?: string | null;
    } | null
  )?.accounting_informal_entry_id;

  if (accountingInformalEntryId) {
    try {
      await formalizarEntry(accountingInformalEntryId, params.orgId);
    } catch (formalizeError) {
      console.error(
        "No se pudo formalizar el asiento informal luego de autorizar en ARCA",
        formalizeError
      );
    }
  }

  return toArcaSaleInvoiceResult(
    {
      id: persistedSale.id,
      arcaStatus: persistedSale.arca_status,
      invoiceNumber: persistedSale.invoice_number,
      arcaCae: persistedSale.arca_cae,
      arcaCaeExpiresAt: persistedSale.arca_cae_expires_at,
      arcaAuthorizedAt: persistedSale.arca_authorized_at,
      arcaPointOfSale: persistedSale.arca_point_of_sale,
      arcaVoucherNumber: persistedSale.arca_voucher_number,
      arcaVoucherTypeCode: persistedSale.arca_voucher_type_code,
      arcaLastError: persistedSale.arca_last_error,
      arcaRequestJson: persistedSale.arca_request_json ?? null,
      arcaResponseJson: persistedSale.arca_response_json ?? null,
    },
    {
      idempotent: false,
    }
  );
}

async function persistInvoiceError(params: {
  orgId: string;
  saleId: string;
  requestJson: Json | null;
  responseJson: Json | null;
  errorMessage: string;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("sales_orders")
    .update({
      arca_status: "error",
      arca_last_error: params.errorMessage,
      arca_request_json: params.requestJson,
      arca_response_json: params.responseJson,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", params.orgId)
    .eq("id", params.saleId);

  if (error) {
    throw new ArcaConnectionError(
      `No se pudo guardar el error fiscal de la venta: ${error.message}`
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ARCA uncertainty requires an explicit durable branch.
export async function emitSaleInvoice(params: {
  orgSlug: string;
  saleId: string;
}): Promise<ArcaSaleInvoiceResult> {
  await assertCanIssueOrganizationArca(params.orgSlug);
  const validation = await validateSaleForArcaInvoicing(params);

  if (validation.kind === "already_authorized") {
    return validation.result;
  }

  const context = validation.context;
  if (!context) {
    throw new ArcaValidationError("No se pudo preparar la emisión ARCA.");
  }

  const client = createArcaClientFromCredentials({
    cuit: context.organizationCuit,
    cert: context.resolvedCredentials.cert,
    key: context.resolvedCredentials.key,
    environment: context.resolvedCredentials.environment,
  });
  const fiscalCurrency = await resolveArcaFiscalCurrency(
    client as unknown as ArcaCurrencyQuoteClient,
    buildInvoiceFiscalCurrency(context.sale.currency)
  );
  const request = buildArcaVoucherRequestFromSale(context, fiscalCurrency);
  const requestJson = toJsonValue({
    saleId: context.sale.id,
    invoiceType: context.effectiveInvoiceType,
    requestedInvoiceType: context.sale.invoiceType,
    customer: {
      id: context.sale.customer.id,
      cuit: context.sale.customer.cuit,
      taxCondition: context.sale.customer.taxCondition,
    },
    items: context.sale.items,
    taxes: context.sale.taxes,
    wsfeRequest: request,
  });

  const pendingSale = await markSaleInvoicePending({
    orgId: context.organizationId,
    saleId: context.sale.id,
    requestJson: requestJson ?? {},
  });

  if (!pendingSale?.id) {
    const currentValidation = await validateSaleForArcaInvoicing(params);
    if (currentValidation.kind === "already_authorized") {
      return currentValidation.result;
    }

    throw new ArcaValidationError(
      "No se pudo iniciar la emisión fiscal porque la venta cambió de estado. Reintentá desde el detalle."
    );
  }

  let authorization: {
    CAE: string;
    CAEFchVto: string;
    voucherNumber: number;
  } | null = null;
  let responseJson: Json | null = null;

  try {
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
      })) ??
      toJsonValue({
        authorization,
      });
  } catch (error) {
    const sanitizedError = sanitizeArcaErrorMessage(error);
    const mappedErrorMessage = mapArcaEmissionErrorMessage({
      errorMessage: sanitizedError,
      sale: context.sale,
      effectiveInvoiceType: context.effectiveInvoiceType,
    });

    if (error instanceof ArcaValidationError) {
      await persistInvoiceError({
        orgId: context.organizationId,
        saleId: context.sale.id,
        requestJson,
        responseJson,
        errorMessage:
          mappedErrorMessage ||
          "No se pudo completar la emisión fiscal en ARCA.",
      });
    } else {
      // A transport failure may have happened after ARCA authorized the
      // voucher. Keep the persisted request pending and never submit it a
      // second time automatically; the caller can reconcile the exact record.
      const supabase = await createClient();
      await supabase
        .from("sales_orders")
        .update({
          arca_status: "pending",
          arca_last_error:
            "Resultado ARCA indeterminado. Requiere conciliación antes de reintentar para evitar un comprobante duplicado.",
          arca_request_json: requestJson,
          arca_response_json: responseJson,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", context.organizationId)
        .eq("id", context.sale.id);
    }

    throw new ArcaConnectionError(
      mappedErrorMessage || "No se pudo completar la emisión fiscal en ARCA."
    );
  }

  if (!authorization) {
    throw new ArcaConnectionError(
      "No se obtuvo una autorización válida de ARCA para la venta."
    );
  }

  const authorizedRequestJson = persistFiscalCurrencySnapshot({
    requestJson: requestJson ?? {},
    request,
  });

  const result = await persistAuthorizedInvoice({
    orgId: context.organizationId,
    saleId: context.sale.id,
    invoiceType: context.effectiveInvoiceType,
    pointOfSale: request.PtoVta,
    voucherTypeCode: request.CbteTipo,
    voucherNumber: authorization.voucherNumber,
    authorization,
    requestJson: authorizedRequestJson,
    responseJson: responseJson ?? {},
    preventaSale: context.sale.status === "DRAFT" ? context.sale : undefined,
  });

  const supabase = await createClient();
  await regenerateAuthorizedSaleRemittances(
    {
      orgSlug: params.orgSlug,
      orgId: context.organizationId,
      saleId: context.sale.id,
    },
    {
      childOrderRemittances: (regenerationParams) =>
        regenerateChildOrderRemitos({ supabase, ...regenerationParams }),
      saleRemittance: (regenerationParams) =>
        regenerateSaleLevelRemito({ supabase, ...regenerationParams }),
    }
  );

  try {
    const emailResult = await sendSaleInvoiceEmail({
      orgSlug: params.orgSlug,
      saleId: context.sale.id,
    });

    if (!emailResult.sent) {
      console.warn("Sale invoice email was not sent:", emailResult);
    }
  } catch (emailError) {
    console.error("Error sending sale invoice email:", emailError);
  }

  return result;
}
