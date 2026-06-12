"use server";

import { buildArcaQrVerifierUrlFromInput } from "@/modules/arca/arca-qr";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  createDirectSale,
  getDirectSaleById,
} from "../service/direct-sales.service";
import type {
  CreateDirectSaleInput,
  CreateDirectSaleResult,
  DirectSaleDetail,
  TicketSaleData,
  TicketSaleItem,
} from "../types";
import { createDirectSaleSchema } from "../types";

const ARCA_DATE_NUMBER_REGEX = /^\d{8}$/;

function resolveTicketQuantityKind(
  unitOfMeasure?: string | null
): TicketSaleItem["quantityKind"] {
  if (
    unitOfMeasure === "KG" ||
    unitOfMeasure === "LT" ||
    unitOfMeasure === "MT"
  ) {
    return "weight";
  }

  return "units";
}

function mapDirectSaleToTicketData(
  sale: DirectSaleDetail,
  issuerCuit: string | null | undefined
): TicketSaleData {
  const items = sale.items.map((item) => ({
    quantity: Number(item.quantity ?? 0),
    product: item.product?.name ?? item.product?.sku ?? "Producto",
    unitPrice: Number(item.unit_price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    quantityKind: resolveTicketQuantityKind(item.product?.unitOfMeasure),
  }));
  const fiscal = buildTicketFiscalData(sale, issuerCuit);
  const customerName =
    sale.customer?.fantasy_name ||
    sale.customer?.business_name ||
    "Consumidor final";

  return {
    saleNumber: sale.receipt_number ?? sale.id,
    saleDate: sale.sale_date,
    receiver: {
      name: customerName,
      documentLabel: sale.customer?.cuit
        ? `CUIT/DNI: ${sale.customer.cuit}`
        : "Consumidor final",
      vatCondition:
        getCustomerTaxConditionLabel(sale.customer?.tax_condition) ??
        sale.customer?.tax_condition ??
        "Consumidor final",
    },
    items,
    subtotal: Number(sale.subtotal_amount ?? 0),
    taxAmount: Number(sale.tax_amount ?? 0),
    taxes: (sale.taxes ?? []).map((tax) => ({
      name: tax.name,
      rate: Number(tax.rate ?? 0),
      amount: Number(tax.tax_amount ?? 0),
      baseAmount: Number(tax.base_amount ?? 0),
    })),
    fiscal,
    total: Number(sale.total_amount ?? 0),
  };
}

function formatArcaDateNumberToIso(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  const raw = String(value).padStart(8, "0");
  if (!ARCA_DATE_NUMBER_REGEX.test(raw)) {
    return null;
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function getWsfeRequest(sale: DirectSaleDetail): Record<string, unknown> {
  const root = sale.arca_request_json;

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return {};
  }

  const request = (root as Record<string, unknown>).wsfeRequest;
  return request && typeof request === "object" && !Array.isArray(request)
    ? (request as Record<string, unknown>)
    : {};
}

function buildTicketFiscalData(
  sale: DirectSaleDetail,
  issuerCuit: string | null | undefined
): TicketSaleData["fiscal"] {
  if (
    sale.arca_status !== "authorized" ||
    !(
      sale.cae &&
      sale.cae_expiration_date &&
      sale.arca_point_of_sale &&
      sale.arca_voucher_number &&
      sale.arca_voucher_type_code
    )
  ) {
    return null;
  }

  const invoiceType =
    sale.invoice_type === "FACTURA_B" || sale.invoice_type === "FACTURA_C"
      ? sale.invoice_type
      : null;

  if (!invoiceType) {
    return null;
  }

  const request = getWsfeRequest(sale);
  const issueDate =
    formatArcaDateNumberToIso(request.CbteFch) ??
    sale.arca_authorized_at ??
    sale.sale_date ??
    new Date().toISOString();
  const receiverDocumentType =
    typeof request.DocTipo === "number" ? request.DocTipo : null;
  const receiverDocumentNumber =
    typeof request.DocNro === "number" ? request.DocNro : null;

  const qrUrl = buildArcaQrVerifierUrlFromInput({
    issueDate,
    issuerCuit: issuerCuit ?? "",
    pointOfSale: sale.arca_point_of_sale,
    voucherTypeCode: sale.arca_voucher_type_code,
    voucherNumber: sale.arca_voucher_number,
    totalAmount: Number(sale.total_amount ?? 0),
    currency: typeof request.MonId === "string" ? request.MonId : "PES",
    currencyRate: typeof request.MonCotiz === "number" ? request.MonCotiz : 1,
    receiverDocumentType,
    receiverDocumentNumber,
    authorizationCode: sale.cae,
  });

  return {
    invoiceType,
    letter: invoiceType === "FACTURA_B" ? "B" : "C",
    voucherTypeCode: sale.arca_voucher_type_code,
    pointOfSale: sale.arca_point_of_sale,
    voucherNumber: sale.arca_voucher_number,
    invoiceNumber: sale.invoice_number,
    cae: sale.cae,
    caeExpirationDate: sale.cae_expiration_date,
    qrUrl,
  };
}

export type CreateDirectSaleActionResult = {
  success: boolean;
  posSaleId?: string;
  ticketSaleData?: TicketSaleData;
  arcaInvoice?: CreateDirectSaleResult["arcaInvoice"];
  error?: string;
};

export async function createDirectSaleAction(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleActionResult> {
  const parsed = createDirectSaleSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      success: false,
      error:
        issue?.message ?? "Datos inválidos para registrar la venta directa.",
    };
  }

  try {
    const result = await createDirectSale(parsed.data);
    let ticketSaleData: TicketSaleData | undefined;

    try {
      const [sale, organization] = await Promise.all([
        getDirectSaleById(parsed.data.orgSlug, result.posSaleId),
        getOrganizationBySlug(parsed.data.orgSlug),
      ]);
      if (sale) {
        ticketSaleData = mapDirectSaleToTicketData(sale, organization?.cuit);
      }
    } catch (ticketError) {
      console.error(
        "Error mapping direct sale to ticket payload:",
        ticketError
      );
    }

    return {
      success: true,
      posSaleId: result.posSaleId,
      ticketSaleData,
      arcaInvoice: result.arcaInvoice,
    };
  } catch (error) {
    console.error("Error creating direct sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar la venta directa.",
    };
  }
}
