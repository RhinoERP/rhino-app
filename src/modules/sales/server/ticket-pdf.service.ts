import "server-only";

import QRCode from "qrcode";
import { formatCurrency } from "@/lib/format";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import type {
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
} from "../types";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PrintableTicketDocument = {
  filename: string;
  html: string;
  content: Buffer;
};

function escapeHtml(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "No informado";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return "No informado";
  }

  if (ISO_DATE_PATTERN.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isFinalConsumerText(value: string | null | undefined): boolean {
  return normalizeComparableText(value) === "consumidor final";
}

function formatPrintableCompanyAddress(
  value: string | null | undefined
): string | null {
  const address = value?.trim() ?? "";
  const normalized = normalizeComparableText(address);

  if (
    !address ||
    normalized === "direccion no informada" ||
    normalized === "dirección no informada" ||
    normalized === "no informado"
  ) {
    return null;
  }

  return address;
}

function buildReceiverRows(sale: TicketSaleData): string {
  const receiver = sale.receiver;
  const name = receiver?.name?.trim() || "Consumidor final";
  const documentLabel = receiver?.documentLabel?.trim() ?? "";
  const vatCondition = receiver?.vatCondition?.trim() ?? "";
  const rows = [`<div>Receptor: <strong>${escapeHtml(name)}</strong></div>`];

  if (
    documentLabel &&
    normalizeComparableText(documentLabel) !== normalizeComparableText(name)
  ) {
    rows.push(
      `<div>Documento: <strong>${escapeHtml(documentLabel)}</strong></div>`
    );
  }

  if (
    vatCondition &&
    normalizeComparableText(vatCondition) !== normalizeComparableText(name) &&
    normalizeComparableText(vatCondition) !==
      normalizeComparableText(documentLabel) &&
    !(isFinalConsumerText(name) && isFinalConsumerText(vatCondition))
  ) {
    rows.push(
      `<div>Condición IVA: <strong>${escapeHtml(vatCondition)}</strong></div>`
    );
  }

  return rows.join("");
}

function isIvaTax(tax: NonNullable<TicketSaleData["taxes"]>[number]): boolean {
  return normalizeComparableText(tax.name).includes("iva");
}

function resolveFiscalTaxDisclosure(sale: TicketSaleData): {
  totalTaxAmount: number;
  containedVatAmount: number;
  otherIndirectAmount: number;
} {
  const taxes = (sale.taxes ?? []).filter((tax) => tax.amount > 0);
  const fallbackTaxAmount =
    typeof sale.taxAmount === "number" && sale.taxAmount > 0
      ? sale.taxAmount
      : 0;

  if (taxes.length === 0) {
    return {
      totalTaxAmount: fallbackTaxAmount,
      containedVatAmount: fallbackTaxAmount,
      otherIndirectAmount: 0,
    };
  }

  const containedVatAmount = roundMoney(
    taxes
      .filter((tax) => isIvaTax(tax))
      .reduce((sum, tax) => sum + tax.amount, 0)
  );
  const totalTaxAmount = roundMoney(
    taxes.reduce((sum, tax) => sum + tax.amount, 0)
  );

  return {
    totalTaxAmount,
    containedVatAmount,
    otherIndirectAmount: roundMoney(
      Math.max(0, totalTaxAmount - containedVatAmount)
    ),
  };
}

function resolveFiscalGrossSubtotal(params: {
  subtotal: number;
  total: number;
  taxAmount: number;
}): number {
  const subtotal = Math.max(0, params.subtotal);
  const total = Math.max(0, params.total);
  const computedGrossSubtotal = roundMoney(
    subtotal + Math.max(0, params.taxAmount)
  );

  if (Math.abs(computedGrossSubtotal - total) <= 0.05) {
    return total;
  }

  if (computedGrossSubtotal > total) {
    return computedGrossSubtotal;
  }

  return Math.max(subtotal, total);
}

function resolvePrintableItems(
  sale: TicketSaleData,
  displaySubtotal: number
): TicketSaleItem[] {
  if (!sale.fiscal || sale.subtotal <= 0 || displaySubtotal <= sale.subtotal) {
    return sale.items;
  }

  const ratio = displaySubtotal / sale.subtotal;
  let remainingSubtotal = roundMoney(displaySubtotal);

  return sale.items.map((item, index) => {
    const isLast = index === sale.items.length - 1;
    const subtotal = isLast
      ? remainingSubtotal
      : roundMoney(Math.max(0, item.subtotal * ratio));
    remainingSubtotal = roundMoney(Math.max(0, remainingSubtotal - subtotal));

    return {
      ...item,
      unitPrice:
        item.quantity > 0
          ? roundMoney(subtotal / item.quantity)
          : roundMoney((item.unitPrice ?? item.subtotal) * ratio),
      subtotal,
    };
  });
}

async function renderQrImage(sale: TicketSaleData): Promise<string | null> {
  if (!sale.fiscal?.qrUrl) {
    return null;
  }

  return await QRCode.toDataURL(sale.fiscal.qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 132,
  });
}

function renderFiscalHeader(
  company: TicketCompanyData,
  sale: TicketSaleData
): string {
  const fiscal = sale.fiscal;
  const companyAddress = formatPrintableCompanyAddress(company.address);

  if (!fiscal) {
    return `
      <section class="document-status">
        <strong>TICKET INTERNO</strong>
        <span>No válido como factura</span>
      </section>
    `;
  }

  return `
    <section class="fiscal-box">
      <div class="letter-box">
        <strong>${escapeHtml(fiscal.letter)}</strong>
        <span>Cod. ${String(fiscal.voucherTypeCode).padStart(3, "0")}</span>
      </div>
      <div class="fiscal-meta">
        <strong>Ticket Factura ${escapeHtml(fiscal.letter)}</strong>
        <span>PV ${String(fiscal.pointOfSale).padStart(5, "0")}</span>
        <span>Nro. ${String(fiscal.voucherNumber).padStart(8, "0")}</span>
      </div>
    </section>
    <section class="issuer-tax">
      <div>Razón social: <strong>${escapeHtml(company.name)}</strong></div>
      ${companyAddress ? `<div>Domicilio comercial: <strong>${escapeHtml(companyAddress)}</strong></div>` : ""}
      <div>CUIT: <strong>${escapeHtml(company.cuit)}</strong></div>
      <div>IVA: <strong>${escapeHtml(company.vatCondition ?? "No informado")}</strong></div>
      <div>IIBB: <strong>${escapeHtml(company.grossIncomeNumber ?? "No informado")}</strong></div>
      <div>Inicio de actividades: <strong>${escapeHtml(formatDateOnly(company.activityStartDate))}</strong></div>
    </section>
  `;
}

async function generateTicketHtml(params: {
  company: TicketCompanyData;
  sale: TicketSaleData;
}): Promise<string> {
  const { company, sale } = params;
  const qrDataUrl = await renderQrImage(sale);
  const companyAddress = formatPrintableCompanyAddress(company.address);
  const fiscalTaxDisclosure = resolveFiscalTaxDisclosure(sale);
  const displaySubtotal = sale.fiscal
    ? resolveFiscalGrossSubtotal({
        subtotal: sale.subtotal,
        total: sale.total,
        taxAmount: fiscalTaxDisclosure.totalTaxAmount,
      })
    : sale.subtotal;
  const discountAmount = sale.fiscal
    ? roundMoney(Math.max(0, displaySubtotal - sale.total))
    : 0;
  const printableItems = resolvePrintableItems(sale, displaySubtotal);

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: "Courier New", monospace;
      font-size: 10px;
      line-height: 1.25;
    }
    .ticket { width: 80mm; padding: 3mm; }
    .center { text-align: center; }
    .issuer-name { margin: 0 0 2mm; font-size: 13px; text-transform: uppercase; }
    .document-status {
      margin: 2mm 0;
      padding: 2mm;
      border: 1px dashed #000;
      text-align: center;
      display: grid;
      gap: 1mm;
    }
    .fiscal-box {
      display: grid;
      grid-template-columns: 20mm 1fr;
      gap: 2mm;
      align-items: center;
      margin: 2mm 0;
      padding: 2mm 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }
    .letter-box {
      min-height: 18mm;
      border: 1px solid #000;
      display: grid;
      place-items: center;
      text-align: center;
    }
    .letter-box strong { display: block; font-size: 22px; line-height: 1; }
    .letter-box span { display: block; font-size: 9px; }
    .fiscal-meta { display: grid; gap: 1mm; text-transform: uppercase; }
    .issuer-tax,
    .receiver,
    .fiscal-footer { display: grid; gap: 1mm; margin-top: 2mm; }
    table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
    th, td { padding: 1mm 0; vertical-align: top; border-bottom: 1px dashed #999; }
    th { text-align: left; font-weight: 700; }
    .right { text-align: right; }
    .totals { margin-top: 2mm; display: grid; gap: 1mm; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .total { font-size: 13px; font-weight: 700; }
    .tax-disclosure { margin-top: 2mm; padding-top: 2mm; border-top: 1px dashed #000; display: grid; gap: 1mm; }
    .qr { margin-top: 2mm; text-align: center; }
    .qr img { width: 28mm; height: 28mm; }
  </style>
</head>
<body>
  <main class="ticket">
    <header class="center">
      <h1 class="issuer-name">${escapeHtml(company.name)}</h1>
      ${companyAddress ? `<div>${escapeHtml(companyAddress)}</div>` : ""}
      <div>CUIT: ${escapeHtml(company.cuit)}</div>
    </header>

    ${renderFiscalHeader(company, sale)}

    <section class="receiver">
      <div>Emisión: <strong>${escapeHtml(formatDateTime(sale.saleDate))}</strong></div>
      ${buildReceiverRows(sale)}
    </section>

    <table>
      <thead>
        <tr>
          <th>Cant.</th>
          <th>Descripción</th>
          <th class="right">P.Unit</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${printableItems
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatQuantity(item.quantity))}</td>
                <td>${escapeHtml(item.product)}</td>
                <td class="right">${escapeHtml(formatCurrency(item.unitPrice ?? 0))}</td>
                <td class="right">${escapeHtml(formatCurrency(item.subtotal))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>

    ${
      sale.fiscal && fiscalTaxDisclosure.totalTaxAmount > 0
        ? `
          <section class="tax-disclosure">
            <strong>REG. FISCAL (LEY 27.743)</strong>
            <div class="row"><span>IVA contenido</span><strong>${escapeHtml(formatCurrency(fiscalTaxDisclosure.containedVatAmount))}</strong></div>
            <div class="row"><span>Otros imp. nac. indirectos</span><strong>${escapeHtml(formatCurrency(fiscalTaxDisclosure.otherIndirectAmount))}</strong></div>
          </section>
        `
        : ""
    }

    <section class="totals">
      <div class="row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(displaySubtotal))}</strong></div>
      ${
        sale.fiscal && discountAmount > 0
          ? `<div class="row"><span>Descuento</span><strong>${escapeHtml(formatCurrency(discountAmount))}</strong></div>`
          : ""
      }
      ${
        sale.fiscal
          ? ""
          : (sale.taxes ?? [])
              .filter((tax) => tax.amount > 0)
              .map(
                (tax) => `
                <div class="row">
                  <span>${escapeHtml(tax.name)}${tax.rate ? ` (${tax.rate}%)` : ""}</span>
                  <strong>${escapeHtml(formatCurrency(tax.amount))}</strong>
                </div>
              `
              )
              .join("")
      }
      <div class="row total"><span>Total</span><strong>${escapeHtml(formatCurrency(sale.total))}</strong></div>
    </section>

    ${
      sale.fiscal
        ? `
        <footer class="fiscal-footer">
          <div>CAE: <strong>${escapeHtml(sale.fiscal.cae)}</strong></div>
          <div>Vto. CAE: <strong>${escapeHtml(formatDateOnly(sale.fiscal.caeExpirationDate))}</strong></div>
          ${
            qrDataUrl
              ? `<div class="qr"><img src="${qrDataUrl}" alt="QR fiscal ARCA" /><div>Escaneá para validar en ARCA</div></div>`
              : ""
          }
        </footer>
        `
        : `<footer class="document-status"><strong>Ticket interno</strong><span>No contiene CAE ni QR fiscal.</span></footer>`
    }
  </main>
</body>
</html>
`;
}

export async function generateTicketPdfDocument(params: {
  company: TicketCompanyData;
  sale: TicketSaleData;
}): Promise<PrintableTicketDocument> {
  const html = await generateTicketHtml(params);
  const content = await renderHtmlToPdfBuffer(html);
  const filename = params.sale.fiscal?.invoiceNumber
    ? `ticket-factura-${params.sale.fiscal.invoiceNumber}.pdf`
    : `ticket-interno-${params.sale.saleNumber ?? "venta-directa"}.pdf`;

  return {
    filename,
    html,
    content,
  };
}
