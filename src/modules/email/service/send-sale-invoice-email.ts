import "server-only";

import { jsPDF } from "jspdf";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getInvoiceTypeLabel,
  getInvoiceTypeLetter,
} from "@/modules/sales/invoice-type-utils";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";
import { createResendClient } from "../client";
import { SaleInvoiceEmail } from "../templates/sale-invoice-email";

type SendSaleInvoiceEmailParams = {
  orgSlug: string;
  saleId: string;
  fromEmail?: string;
  fromName?: string;
};

type SaleInvoiceEmailResult =
  | { sent: true; recipient: string }
  | {
      sent: false;
      reason: "missing_customer_email" | "sale_not_authorized";
    };

const DEFAULT_FROM_EMAIL = "empresa@rhinosapp.com";
const DEFAULT_FROM_NAME = "Rhino";

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function getCustomerDisplayName(sale: SalesOrderDetail): string {
  return (
    sale.customer.fantasy_name?.trim() ||
    sale.customer.business_name?.trim() ||
    "Cliente"
  );
}

function getInvoiceReference(sale: SalesOrderDetail): string {
  return (
    sale.invoice_number?.trim() ||
    (sale.sale_number ? `Venta ${sale.sale_number}` : `Venta ${sale.id}`)
  );
}

function ensurePageSpace(pdf: jsPDF, currentY: number, requiredHeight = 12) {
  if (currentY + requiredHeight <= 280) {
    return currentY;
  }

  pdf.addPage();
  return 20;
}

function drawLabelValueRow(params: {
  pdf: jsPDF;
  y: number;
  label: string;
  value: string;
}) {
  params.pdf.setFont("helvetica", "bold");
  params.pdf.text(params.label, 14, params.y);
  params.pdf.setFont("helvetica", "normal");
  params.pdf.text(params.value, 60, params.y);
}

function buildInvoiceAttachmentName(sale: SalesOrderDetail): string {
  return `Factura_${sanitizeFileNamePart(getInvoiceReference(sale))}.pdf`;
}

function drawInvoiceHeader(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  organizationName: string;
  organizationCuit: string | null | undefined;
}) {
  const { pdf, sale, organizationName, organizationCuit } = params;
  const invoiceTypeLabel = getInvoiceTypeLabel(sale.invoice_type);
  const invoiceReference = getInvoiceReference(sale);

  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(organizationName || "Rhino", 14, y);

  pdf.setFontSize(10);
  pdf.text(
    `${invoiceTypeLabel} ${getInvoiceTypeLetter(sale.invoice_type)}`,
    145,
    y,
    { align: "right" }
  );

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`CUIT: ${organizationCuit?.trim() || "No informado"}`, 14, y);
  pdf.text(`Comprobante: ${invoiceReference}`, 145, y, { align: "right" });

  y += 10;
  pdf.setDrawColor(209, 213, 219);
  pdf.line(14, y, 196, y);

  return y + 9;
}

function drawInvoiceMetadata(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  const pointOfSaleLabel = sale.arca_point_of_sale
    ? String(sale.arca_point_of_sale).padStart(4, "0")
    : "—";
  const voucherNumberLabel = sale.arca_voucher_number
    ? String(sale.arca_voucher_number).padStart(8, "0")
    : "—";

  let y = params.y;

  drawLabelValueRow({
    pdf,
    y,
    label: "Cliente",
    value: getCustomerDisplayName(sale),
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Email",
    value: sale.customer.email?.trim() || "No informado",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Fecha de venta",
    value: formatDateOnly(sale.sale_date),
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Fecha de autorización",
    value: sale.arca_authorized_at
      ? formatDateOnly(sale.arca_authorized_at)
      : "No informada",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Punto de venta",
    value: pointOfSaleLabel,
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Número fiscal",
    value: voucherNumberLabel,
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "CAE",
    value: sale.arca_cae?.trim() || "No informado",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Vto. CAE",
    value: sale.arca_cae_expires_at
      ? formatDateOnly(sale.arca_cae_expires_at)
      : "No informado",
  });

  return y + 12;
}

function drawInvoiceItems(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  let y = params.y;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Detalle", 14, y);

  y += 7;
  pdf.setFillColor(243, 244, 246);
  pdf.rect(14, y - 5, 182, 8, "F");
  pdf.setFontSize(9);
  pdf.text("Descripcion", 16, y);
  pdf.text("Cant.", 122, y, { align: "right" });
  pdf.text("Unit.", 156, y, { align: "right" });
  pdf.text("Subtotal", 194, y, { align: "right" });

  y += 6;
  pdf.setFont("helvetica", "normal");

  for (const item of sale.items) {
    const descriptionLines = pdf.splitTextToSize(
      `${item.name}${item.description ? ` - ${item.description}` : ""}`,
      92
    );
    const blockHeight = Math.max(descriptionLines.length * 5, 6);
    y = ensurePageSpace(pdf, y, blockHeight + 6);

    pdf.text(descriptionLines, 16, y);
    pdf.text(String(item.quantity), 122, y, { align: "right" });
    pdf.text(formatCurrency(item.unitPrice), 156, y, { align: "right" });
    pdf.text(formatCurrency(item.subtotal), 194, y, { align: "right" });

    y += blockHeight;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(14, y, 196, y);
    y += 4;
  }

  return y + 4;
}

function drawInvoiceTaxesAndTotals(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  let y = ensurePageSpace(pdf, params.y, 40);

  if ((sale.taxes?.length ?? 0) > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Impuestos", 14, y);
    y += 7;
    pdf.setFont("helvetica", "normal");

    for (const tax of sale.taxes) {
      y = ensurePageSpace(pdf, y, 8);
      pdf.text(`${tax.name} (${tax.rate}%)`, 16, y);
      pdf.text(formatCurrency(tax.taxAmount), 194, y, { align: "right" });
      y += 6;
    }

    y += 4;
  }

  pdf.setFont("helvetica", "bold");
  pdf.text("Subtotal", 140, y);
  pdf.text(formatCurrency(sale.sub_total ?? 0), 194, y, { align: "right" });
  y += 7;

  if (sale.global_discount_amount && sale.global_discount_amount > 0) {
    pdf.text("Descuento global", 140, y);
    pdf.text(formatCurrency(sale.global_discount_amount), 194, y, {
      align: "right",
    });
    y += 7;
  }

  pdf.text("Total", 140, y);
  pdf.text(formatCurrency(sale.total_amount), 194, y, { align: "right" });

  return y + 14;
}

function drawInvoiceFooter(params: { pdf: jsPDF; y: number }) {
  const y = ensurePageSpace(params.pdf, params.y, 20);

  params.pdf.setFont("helvetica", "normal");
  params.pdf.setFontSize(8);
  params.pdf.setTextColor(75, 85, 99);
  params.pdf.text(
    "Comprobante electrónico generado automáticamente por Rhino.",
    14,
    y
  );
}

function buildSaleInvoicePdfAttachment(params: {
  sale: SalesOrderDetail;
  organizationName: string;
  organizationCuit: string | null | undefined;
}): { filename: string; content: Buffer } {
  const { sale, organizationName, organizationCuit } = params;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const filename = buildInvoiceAttachmentName(sale);
  let y = drawInvoiceHeader({
    pdf,
    sale,
    organizationName,
    organizationCuit,
  });
  y = drawInvoiceMetadata({ pdf, sale, y });
  y = drawInvoiceItems({ pdf, sale, y });
  y = drawInvoiceTaxesAndTotals({ pdf, sale, y });

  pdf.setFont("helvetica", "normal");
  drawInvoiceFooter({ pdf, y });

  const content = Buffer.from(pdf.output("arraybuffer"));

  return { filename, content };
}

export async function sendSaleInvoiceEmail(
  params: SendSaleInvoiceEmailParams
): Promise<SaleInvoiceEmailResult> {
  const [sale, organization, orgSettings] = await Promise.all([
    getSalesOrderById(params.orgSlug, params.saleId),
    getOrganizationBySlug(params.orgSlug),
    getOrgSettings(params.orgSlug),
  ]);

  if (!(sale && organization)) {
    throw new Error("No se pudo preparar el email de factura.");
  }

  if (sale.arca_status !== "authorized") {
    return {
      sent: false,
      reason: "sale_not_authorized",
    };
  }

  const recipient = sale.customer.email?.trim();

  if (!recipient) {
    return {
      sent: false,
      reason: "missing_customer_email",
    };
  }

  const resend = createResendClient();
  const customerName = getCustomerDisplayName(sale);
  const invoiceReference = getInvoiceReference(sale);
  const attachment = buildSaleInvoicePdfAttachment({
    sale,
    organizationName: organization.name,
    organizationCuit: organization.cuit,
  });
  const fromEmail =
    params.fromEmail ||
    process.env.RESEND_INVOICE_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    DEFAULT_FROM_EMAIL;
  const fromName =
    params.fromName ||
    orgSettings.invoice_email_from_name ||
    process.env.RESEND_INVOICE_FROM_NAME ||
    process.env.RESEND_FROM_NAME ||
    organization.name ||
    DEFAULT_FROM_NAME;

  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: recipient,
    subject: `Acá está tu factura electrónica ${invoiceReference}`,
    react: SaleInvoiceEmail({
      customerName,
      organizationName: organization.name,
      invoiceNumber: invoiceReference,
    }),
    attachments: [
      {
        filename: attachment.filename,
        content: attachment.content,
        contentType: "application/pdf",
      },
    ],
  });

  if (error) {
    throw new Error(`Error enviando factura por email: ${error.message}`);
  }

  return {
    sent: true,
    recipient,
  };
}
