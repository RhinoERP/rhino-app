import "server-only";

import QRCode from "qrcode";
import { formatCurrency } from "@/lib/format";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import type { TicketCompanyData, TicketSaleData } from "../types";

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

async function renderQrImage(sale: TicketSaleData): Promise<string | null> {
  if (!sale.fiscal?.qrUrl) {
    return null;
  }

  return await QRCode.toDataURL(sale.fiscal.qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 160,
  });
}

function renderFiscalHeader(
  company: TicketCompanyData,
  sale: TicketSaleData
): string {
  const fiscal = sale.fiscal;

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
      <div>Domicilio comercial: <strong>${escapeHtml(company.address)}</strong></div>
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
    .qr { margin-top: 2mm; text-align: center; }
    .qr img { width: 36mm; height: 36mm; }
  </style>
</head>
<body>
  <main class="ticket">
    <header class="center">
      <h1 class="issuer-name">${escapeHtml(company.name)}</h1>
      <div>${escapeHtml(company.address)}</div>
      <div>CUIT: ${escapeHtml(company.cuit)}</div>
    </header>

    ${renderFiscalHeader(company, sale)}

    <section class="receiver">
      <div>Emisión: <strong>${escapeHtml(formatDateTime(sale.saleDate))}</strong></div>
      <div>Receptor: <strong>${escapeHtml(sale.receiver?.name ?? "Consumidor final")}</strong></div>
      <div>Documento: <strong>${escapeHtml(sale.receiver?.documentLabel ?? "Consumidor final")}</strong></div>
      <div>Condición IVA: <strong>${escapeHtml(sale.receiver?.vatCondition ?? "Consumidor final")}</strong></div>
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
        ${sale.items
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

    <section class="totals">
      <div class="row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(sale.subtotal))}</strong></div>
      ${(sale.taxes ?? [])
        .filter((tax) => tax.amount > 0)
        .map(
          (tax) => `
            <div class="row">
              <span>${escapeHtml(tax.name)}${tax.rate ? ` (${tax.rate}%)` : ""}</span>
              <strong>${escapeHtml(formatCurrency(tax.amount))}</strong>
            </div>
          `
        )
        .join("")}
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
