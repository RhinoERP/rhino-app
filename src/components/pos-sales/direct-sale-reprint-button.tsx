"use client";

import { PrinterIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { buildArcaQrVerifierUrlFromInput } from "@/modules/arca/arca-qr";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { usePrintTicket } from "@/modules/sales/hooks/use-print-ticket";
import type {
  DirectSaleDetail,
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
} from "@/modules/sales/types";

type DirectSaleReprintButtonProps = {
  sale: DirectSaleDetail;
  company: TicketCompanyData;
};

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

function buildFiscalTicketData(
  sale: DirectSaleDetail,
  company: TicketCompanyData
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

  return {
    invoiceType,
    letter: invoiceType === "FACTURA_B" ? "B" : "C",
    voucherTypeCode: sale.arca_voucher_type_code,
    pointOfSale: sale.arca_point_of_sale,
    voucherNumber: sale.arca_voucher_number,
    invoiceNumber: sale.invoice_number,
    cae: sale.cae,
    caeExpirationDate: sale.cae_expiration_date,
    qrUrl: buildArcaQrVerifierUrlFromInput({
      issueDate,
      issuerCuit: company.cuit,
      pointOfSale: sale.arca_point_of_sale,
      voucherTypeCode: sale.arca_voucher_type_code,
      voucherNumber: sale.arca_voucher_number,
      totalAmount: Number(sale.total_amount ?? 0),
      currency: typeof request.MonId === "string" ? request.MonId : "PES",
      currencyRate: typeof request.MonCotiz === "number" ? request.MonCotiz : 1,
      receiverDocumentType:
        typeof request.DocTipo === "number" ? request.DocTipo : null,
      receiverDocumentNumber:
        typeof request.DocNro === "number" ? request.DocNro : null,
      authorizationCode: sale.cae,
    }),
  };
}

function mapSaleToTicketData(
  sale: DirectSaleDetail,
  company: TicketCompanyData
): TicketSaleData {
  const items = sale.items.map((item) => ({
    quantity: Number(item.quantity ?? 0),
    product: item.product?.name ?? item.product?.sku ?? "Producto",
    unitPrice: Number(item.unit_price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    quantityKind: resolveTicketQuantityKind(item.product?.unitOfMeasure),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Number(sale.total_amount ?? subtotal);
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
    subtotal,
    taxAmount: Number(sale.tax_amount ?? 0),
    taxes: (sale.taxes ?? []).map((tax) => ({
      name: tax.name,
      rate: Number(tax.rate ?? 0),
      amount: Number(tax.tax_amount ?? 0),
      baseAmount: Number(tax.base_amount ?? 0),
    })),
    fiscal: buildFiscalTicketData(sale, company),
    total,
  };
}

export function DirectSaleReprintButton({
  sale,
  company,
}: DirectSaleReprintButtonProps) {
  const { isPrinting, printTicket } = usePrintTicket({
    transport: "web-usb",
  });

  const ticketSale = useMemo(
    () => mapSaleToTicketData(sale, company),
    [company, sale]
  );

  return (
    <Button
      className="w-full justify-between"
      disabled={isPrinting}
      onClick={() => {
        printTicket({
          sale: ticketSale,
          company,
        });
      }}
      type="button"
      variant="outline"
    >
      <div className="flex items-center">
        <PrinterIcon className="mr-2 h-4 w-4" />
        {isPrinting ? "Imprimiendo..." : "Reimprimir ticket"}
      </div>
    </Button>
  );
}
