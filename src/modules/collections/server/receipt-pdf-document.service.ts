import "server-only";

import { remittanceIssuerConfig } from "@/config/remittance";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import {
  generateReceiptHTML,
  type ReceiptDocumentData,
} from "../service/receipt-generator.service";

type ReceiptPdfDocument = {
  filename: string;
  content: Buffer;
  html: string;
  receiptNumber: string;
  totalAmount: number;
};

const INVOICE_TYPE_SHORT_LABELS: Record<string, string> = {
  FACTURA_A: "FCA",
  FACTURA_A_RETENCION: "FCA",
  FACTURA_B: "FCB",
  FACTURA_C: "FCC",
  FACTURA_E: "FCE",
  NOTA_DE_VENTA: "NVE",
};

function buildDocumentLabel(params: {
  invoiceType?: string | null;
  invoiceNumber?: string | null;
  remittanceNumber?: string | null;
  saleNumber?: number | null;
}): string {
  const shortType = params.invoiceType
    ? (INVOICE_TYPE_SHORT_LABELS[params.invoiceType] ?? params.invoiceType)
    : null;

  if (params.invoiceNumber) {
    return `${shortType ?? "CMP"}, ${params.invoiceNumber}`;
  }
  if (params.remittanceNumber) {
    return `RTO, ${params.remittanceNumber}`;
  }
  return `VTA, ${params.saleNumber ?? "—"}`;
}

function buildCurrencyLabel(currency?: string | null): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) {
    return "PS, PESOS";
  }
  if (normalized === "PS" || normalized === "PESOS" || normalized === "ARS") {
    return "PS, PESOS";
  }
  return normalized;
}

export async function claimReceiptNumber(orgId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_receipt_number", {
    p_org_id: orgId,
  });

  if (error || typeof data !== "string") {
    throw new Error("No se pudo generar el número de recibo");
  }

  return data;
}

export async function buildReceiptDocumentData(params: {
  orgId: string;
  paymentId: string;
  receiptNumber: string;
}): Promise<{
  data: ReceiptDocumentData;
  customerName: string;
}> {
  const supabase = await createClient();

  const { data: payment, error: paymentError } = await supabase
    .from("receivable_payments")
    .select(
      "id, amount, payment_date, reference_number, account_receivable_id, organization_id"
    )
    .eq("id", params.paymentId)
    .eq("organization_id", params.orgId)
    .single();

  if (paymentError || !payment) {
    throw new Error("Pago no encontrado");
  }

  const { data: account } = await supabase
    .from("accounts_receivable")
    .select("id, pending_balance, total_amount, sales_order_id, customer_id")
    .eq("id", payment.account_receivable_id)
    .single();

  if (!account) {
    throw new Error("Cuenta por cobrar no encontrada");
  }

  const [customerResult, saleResult, creditApplicationsResult, orgResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, business_name, cuit")
        .eq("id", account.customer_id)
        .single(),
      supabase
        .from("sales_orders")
        .select(
          "id, invoice_number, invoice_type, sale_date, sale_number, remittance_number, currency"
        )
        .eq("id", account.sales_order_id)
        .single(),
      supabase
        .from("customer_credit_applications")
        .select("amount")
        .eq("receivable_payment_id", payment.id),
      supabase
        .from("organizations")
        .select("id, name, cuit, logo_url")
        .eq("id", params.orgId)
        .single(),
    ]);

  const customer = customerResult.data;
  const sale = saleResult.data;
  const organization = orgResult.data;

  if (!(customer && sale && organization)) {
    throw new Error("No se pudo cargar la información del recibo");
  }

  const creditApplied = truncateMoney(
    (creditApplicationsResult.data ?? []).reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0
    )
  );

  const appliedAmount = truncateMoney(
    Number(payment.amount ?? 0) + creditApplied
  );
  const pendingBalance = truncateMoney(Number(account.pending_balance ?? 0));
  const originBalance = truncateMoney(
    Math.min(pendingBalance + appliedAmount, Number(account.total_amount ?? 0))
  );

  const data: ReceiptDocumentData = {
    receiptNumber: params.receiptNumber,
    date: payment.payment_date,
    issuer: {
      businessName: organization.name ?? "Empresa",
      cuit: organization.cuit,
      legalAddress: remittanceIssuerConfig.legalAddress,
      logoUrl: organization.logo_url ?? remittanceIssuerConfig.logoUrl,
    },
    customer: {
      businessName: customer.business_name ?? "Cliente",
      cuit: customer.cuit,
      reference: payment.reference_number,
    },
    currencyLabel: buildCurrencyLabel(sale.currency),
    appliedDocuments: [
      {
        date: sale.sale_date,
        documentLabel: buildDocumentLabel({
          invoiceType: sale.invoice_type,
          invoiceNumber: sale.invoice_number,
          remittanceNumber: sale.remittance_number,
          saleNumber: sale.sale_number,
        }),
        originBalance,
        appliedAmount,
      },
    ],
    totalAmount: appliedAmount,
  };

  return { data, customerName: customer.business_name ?? "Cliente" };
}

export async function renderReceiptPdfDocument(params: {
  orgId: string;
  paymentId: string;
  receiptNumber: string;
}): Promise<ReceiptPdfDocument> {
  const { data } = await buildReceiptDocumentData(params);

  const html = generateReceiptHTML(data);
  const content = await renderHtmlToPdfBuffer(html);

  const sanitizedNumber = params.receiptNumber.replace(/[^0-9]/g, "");

  return {
    filename: `Recibo_${sanitizedNumber || "sin-numero"}.pdf`,
    content,
    html,
    receiptNumber: params.receiptNumber,
    totalAmount: data.totalAmount,
  };
}
