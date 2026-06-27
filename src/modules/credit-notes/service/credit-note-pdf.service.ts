import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getInvoiceTypeLetter } from "@/modules/sales/invoice-type-utils";
import type { InvoiceType } from "@/modules/sales/types";
import type { CreditNote } from "../types";

const escapeHtml = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const displayValue = (value: string | null | undefined, fallback = "—") => {
  const trimmed = value?.trim();
  return escapeHtml(trimmed || fallback);
};

function formatArcaNumber(
  pointOfSale: number | null,
  voucherNumber: number | null
): string | null {
  if (!(pointOfSale && voucherNumber)) {
    return null;
  }

  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

export type ReturnItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  creditAmount: number;
};

export type CreditNotePDFData = {
  creditNoteNumber: string;
  issueDate: string;
  invoiceType: string;
  issuer: {
    businessName: string;
    cuit?: string | null;
  };
  customer: {
    businessName: string;
    fantasyName?: string | null;
    cuit?: string | null;
  };
  sale: {
    saleNumber?: number | null;
    invoiceNumber?: string | null;
  } | null;
  amount: number;
  observations?: string | null;
  returnItems?: ReturnItem[] | null;
  fiscal: {
    isAuthorized: boolean;
    number: string | null;
    cae: string | null;
    caeExpiresAt: string | null;
  };
};

function formatReferenceDocument(data: CreditNotePDFData): string {
  if (data.sale?.invoiceNumber) {
    return data.sale.invoiceNumber;
  }

  if (data.sale?.saleNumber != null) {
    return `N°${data.sale.saleNumber}`;
  }

  return "—";
}

function buildFiscalHeaderHtml(data: CreditNotePDFData): string {
  if (!data.fiscal.isAuthorized) {
    return "";
  }

  const caeExpiration = data.fiscal.caeExpiresAt
    ? formatDateOnly(data.fiscal.caeExpiresAt)
    : "—";

  return `<div class="doctype-dates">CAE: ${displayValue(data.fiscal.cae)}</div>
      <div class="doctype-dates">Vto. CAE: ${caeExpiration}</div>`;
}

function buildReturnItemsHtml(returnItems?: ReturnItem[] | null): string {
  if (!(returnItems && returnItems.length > 0)) {
    return "";
  }

  return `<table class="items-table">
    <thead>
      <tr>
        <th>Producto</th>
        <th class="th-num">Cant.</th>
        <th class="th-num">P. Unit.</th>
        <th class="th-num">Crédito</th>
      </tr>
    </thead>
    <tbody>
      ${returnItems
        .map(
          (item) => `<tr>
        <td>${escapeHtml(item.productName)}</td>
        <td class="td-num">${item.quantity}</td>
        <td class="td-num">${formatCurrency(item.unitPrice)}</td>
        <td class="td-num">${formatCurrency(item.creditAmount)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function buildObservationsHtml(observations?: string | null): string {
  return observations
    ? `<div class="obs"><span class="lbl">Observaciones:</span> ${displayValue(observations, "")}</div>`
    : "";
}

function buildDisclaimerHtml(data: CreditNotePDFData): string {
  return data.fiscal.isAuthorized
    ? "Comprobante fiscal autorizado por ARCA"
    : "Documento no válido como factura · Nota de Crédito emitida por el emisor";
}

export function buildCreditNotePDFData(
  creditNote: CreditNote,
  issuerName: string,
  issuerCuit?: string | null,
  returnItems?: ReturnItem[] | null
): CreditNotePDFData {
  return {
    creditNoteNumber: creditNote.creditNoteNumber ?? "—",
    issueDate: creditNote.issueDate,
    invoiceType: creditNote.invoiceType,
    issuer: {
      businessName: issuerName,
      cuit: issuerCuit,
    },
    customer: {
      businessName: creditNote.customer?.businessName ?? "—",
      fantasyName: creditNote.customer?.fantasyName,
      cuit: null,
    },
    sale: creditNote.sale,
    amount: creditNote.amount,
    observations: creditNote.observations,
    returnItems: returnItems ?? null,
    fiscal: {
      isAuthorized: creditNote.arcaStatus === "authorized",
      number: formatArcaNumber(
        creditNote.arcaPointOfSale,
        creditNote.arcaVoucherNumber
      ),
      cae: creditNote.arcaCae,
      caeExpiresAt: creditNote.arcaCaeExpiresAt,
    },
  };
}

export function generateCreditNoteHTML(data: CreditNotePDFData): string {
  const displayNumber =
    data.fiscal.isAuthorized && data.fiscal.number
      ? data.fiscal.number
      : data.creditNoteNumber;
  const fiscalHeaderHtml = buildFiscalHeaderHtml(data);
  const observationsHtml = buildObservationsHtml(data.observations);
  const refDoc = formatReferenceDocument(data);
  const returnItemsHtml = buildReturnItemsHtml(data.returnItems);
  const disclaimerHtml = buildDisclaimerHtml(data);

  const buildContent = () => `
  <div class="page-header">
    <div class="header-left">
      <div class="company-name">${escapeHtml(data.issuer.businessName)}</div>
      ${data.issuer.cuit ? `<div class="company-cuit">CUIT: ${escapeHtml(data.issuer.cuit)}</div>` : ""}
    </div>
    <div class="header-right">
      <div class="doctype-label">NOTA DE CRÉDITO ${data.invoiceType === "NOTA_DE_VENTA" ? "N/V" : getInvoiceTypeLetter(data.invoiceType as InvoiceType)}</div>
      <div class="doctype-number">N° ${displayValue(displayNumber)}</div>
      <div class="doctype-dates">Fecha: ${formatDateOnly(data.issueDate)}</div>
      ${fiscalHeaderHtml}
    </div>
  </div>

  <div class="divider"></div>

  <div class="info-wrap">
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Cliente:</span> <span class="val-bold">${displayValue(data.customer.businessName)}</span></div>
      ${data.customer.fantasyName ? `<div class="info-cell"><span class="lbl">Nombre fantasía:</span> ${displayValue(data.customer.fantasyName)}</div>` : '<div class="info-cell"></div>'}
      <div class="info-cell"><span class="lbl">Comprobante ref.:</span> ${displayValue(refDoc)}</div>
    </div>
  </div>

  ${returnItemsHtml}

  <div class="amount-wrap">
    <div class="amount-label">MONTO DE LA NOTA DE CRÉDITO</div>
    <div class="amount-value">${formatCurrency(data.amount)}</div>
  </div>

  ${observationsHtml}

  <div class="disclaimer">${disclaimerHtml}</div>

  <div class="sig-wrap">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Firma</div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  :root {
    --blue:   #09329d;
    --dark:   #1a1f2e;
    --mid:    #4a5568;
    --muted:  #627499;
    --border: #e2e6f0;
    --bmd:    #c8cfe8;
    --bg:     #f7f8fc;
    --white:  #ffffff;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5px;
    color: var(--dark);
    background: #dde2f0;
    line-height: 1.3;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
    gap: 0;
  }
  .document-copy {
    width: 210mm;
    min-height: 297mm;
    padding: 7mm 10mm;
    background: var(--white);
    box-shadow: 0 2px 12px rgba(30,45,69,0.18);
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    gap: 16px;
  }
  .header-left { display:flex; flex-direction:column; gap:2px; }
  .company-name { font-size:18px; font-weight:700; line-height:1.1; }
  .company-cuit { font-size:8px; color:var(--muted); }
  .header-right { text-align:right; flex-shrink:0; }
  .doctype-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); margin-bottom:1px; }
  .doctype-number { font-size:18px; font-weight:700; line-height:1.1; margin-bottom:2px; }
  .doctype-dates { font-size:8px; color:var(--muted); }
  .divider { height:2px; background:var(--blue); margin-bottom:10px; border-radius:2px; }
  .info-wrap { border:1px solid var(--bmd); border-radius:4px; overflow:hidden; margin-bottom:16px; }
  .info-row { display:flex; border-bottom:1px solid var(--border); }
  .info-row:last-child { border-bottom:none; }
  .info-cell { flex:1; padding:6px 8px; border-right:1px solid var(--border); font-size:8.5px; }
  .info-cell:last-child { border-right:none; }
  .lbl { font-weight:700; color:var(--muted); }
  .val-bold { font-weight:700; color:var(--dark); }
  .amount-wrap {
    border:2px solid var(--blue);
    border-radius:6px;
    padding:20px 24px;
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:8px;
    margin-bottom:16px;
    background:var(--bg);
  }
  .amount-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); }
  .amount-value { font-size:20px; font-weight:700; color:var(--dark); }
  .items-table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:8.5px; }
  .items-table th { background:var(--blue); color:var(--white); padding:5px 8px; text-align:left; font-weight:700; font-size:8px; }
  .th-num { text-align:right; }
  .td-num { text-align:right; }
  .items-table td { padding:4px 8px; border-bottom:1px solid var(--border); }
  .items-table tr:last-child td { border-bottom:none; }
  .obs { margin-bottom:8px; padding:5px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg); font-size:7.5px; }
  .disclaimer { margin-top:5px; text-align:left; font-size:7px; color:var(--muted); font-style:italic; }
  .sig-wrap { display:flex; justify-content:flex-end; margin-top:48px; }
  .sig-block { width:200px; }
  .sig-line { height:1px; background:var(--bmd); margin-bottom:4px; }
  .sig-lbl { font-size:8.5px; color:var(--muted); text-align:center; }
  .document-copy + .document-copy { page-break-before:always; }
  @page { size:A4; margin:0; }
</style>
</head>
<body>
  <div class="document-copy">${buildContent()}</div>
  <div class="document-copy">${buildContent()}</div>
</body>
</html>`;
}
