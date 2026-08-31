import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { formatAmountInWords } from "@/lib/number-to-words";

export type ReceiptDocumentData = {
  receiptNumber: string;
  date: string;
  issuer: {
    businessName: string;
    legalAddress?: string | null;
    cuit?: string | null;
    logoUrl?: string | null;
  };
  customer: {
    businessName: string;
    cuit?: string | null;
    reference?: string | null;
  };
  currencyLabel: string;
  appliedDocuments: Array<{
    date: string;
    documentLabel: string;
    originBalance: number;
    appliedAmount: number;
  }>;
  totalAmount: number;
};

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

export function generateReceiptHTML(data: ReceiptDocumentData): string {
  const appliedRows = data.appliedDocuments
    .map(
      (doc) => `
    <tr>
      <td>${formatDateOnly(doc.date)}</td>
      <td>${displayValue(doc.documentLabel)}</td>
      <td class="c-right">${formatCurrency(doc.originBalance)}</td>
      <td class="c-right">${formatCurrency(doc.appliedAmount)}</td>
      <td class="c-right">${formatCurrency(doc.appliedAmount)}</td>
    </tr>`
    )
    .join("");

  const words = formatAmountInWords(truncateMoney(data.totalAmount));

  const buildDocumentContent = () => `
  <div class="page-header">
    <div class="header-left">
      ${data.issuer.logoUrl ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="Logo" class="logo-img" />` : ""}
      ${data.issuer.logoUrl ? "" : `<div class="company-name">${escapeHtml(data.issuer.businessName)}</div>`}
    </div>
    <div class="header-right">
      <div class="doctype-label">RECIBO</div>
      <div class="doctype-number">N° ${displayValue(data.receiptNumber)}</div>
      <div class="doctype-dates">Fecha: ${formatDateOnly(data.date)}</div>
    </div>
  </div>

  <div class="not-valid">Documento no válido como factura</div>

  <div class="divider"></div>

  <div class="info-wrap">
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Razón Social:</span> <span class="val-bold">${displayValue(data.issuer.businessName)}</span></div>
      <div class="info-cell"><span class="lbl">CUIT:</span> ${displayValue(data.issuer.cuit)}</div>
      <div class="info-cell"><span class="lbl">Domicilio:</span> ${displayValue(data.issuer.legalAddress)}</div>
    </div>
  </div>

  <div class="section-title">Datos del recibo</div>
  <div class="info-wrap">
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Fecha:</span> ${formatDateOnly(data.date)}</div>
      <div class="info-cell info-cell--wide"><span class="lbl">Cliente:</span> <span class="val-bold">${displayValue(data.customer.businessName)}</span></div>
      <div class="info-cell"><span class="lbl">Referencia cliente:</span> ${displayValue(data.customer.reference)}</div>
    </div>
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Sucursal Impositiva:</span> —</div>
      <div class="info-cell"><span class="lbl">Sucursal Empresa:</span> —</div>
      <div class="info-cell"><span class="lbl">Descripción:</span> —</div>
    </div>
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Moneda origen:</span> ${displayValue(data.currencyLabel)}</div>
      <div class="info-cell"><span class="lbl">Total importe:</span> <span class="val-bold">${formatCurrency(data.totalAmount)}</span></div>
      <div class="info-cell"><span class="lbl">Cotización:</span> —</div>
    </div>
  </div>

  <div class="section-title">Comprobantes aplicados</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:70px">Fecha</th>
          <th>Tipo y número</th>
          <th style="width:90px;text-align:right">Saldo origen</th>
          <th style="width:100px;text-align:right">Importe origen</th>
          <th style="width:100px;text-align:right">Importe local</th>
        </tr>
      </thead>
      <tbody>${appliedRows}</tbody>
    </table>
    <div class="total-row">
      <div class="total-label">Total comprobantes aplicados</div>
      <div class="total-amount">${formatCurrency(data.totalAmount)}</div>
    </div>
  </div>

  <div class="words-block">
    <span class="lbl">PESOS:</span> <em>${words}</em>
  </div>

  <div class="sig-wrap">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Recibí Conforme</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Firma</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Aclaración</div>
    </div>
  </div>

  <div class="legal-note">LOS VALORES RECIBIDOS EN EL PRESENTE RECIBO NO CONSTITUYEN CANCELACION DE DEUDA HASTA LA ACREDITACION DE LOS MISMOS EN LAS RESPECTIVAS CUENTAS BANCARIAS.</div>

  <div class="doc-code">Código: RECIBO ${displayValue(data.receiptNumber)}</div>`;

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
    padding: 0;
  }
  .document-copy {
    width: 210mm;
    min-height: 297mm;
    padding: 7mm 10mm;
    background: var(--white);
    box-shadow: 0 2px 12px rgba(30,45,69,0.18);
  }

  /* HEADER */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 6px;
    gap: 16px;
  }
  .header-left { display:flex; align-items:center; gap:8px; }
  .logo-img { max-width:86px; max-height:76px; object-fit:contain; }
  .company-name { font-size:18px; font-weight:700; line-height:1.1; }
  .header-right { text-align:right; flex-shrink:0; }
  .doctype-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); margin-bottom:1px; }
  .doctype-number { font-size:18px; font-weight:700; line-height:1.1; margin-bottom:2px; }
  .doctype-dates { font-size:8px; color:var(--muted); }

  .not-valid {
    text-align: right;
    font-size: 8px;
    font-style: italic;
    color: var(--muted);
    margin-bottom: 4px;
  }

  /* DIVIDER */
  .divider {
    height: 2px;
    background: var(--blue);
    margin-bottom: 10px;
    border-radius: 2px;
  }

  .section-title {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--blue);
    margin: 10px 0 4px;
  }

  /* INFO */
  .info-wrap {
    border: 1px solid var(--bmd);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .info-row {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .info-row:last-child { border-bottom: none; }
  .info-cell {
    flex: 1;
    padding: 6px 8px;
    border-right: 1px solid var(--border);
    font-size: 8.5px;
    color: var(--dark);
    vertical-align: middle;
  }
  .info-cell--wide { flex: 2; }
  .info-cell:last-child { border-right: none; }
  .lbl { font-weight: 700; color: var(--muted); }
  .val-bold { font-weight: 700; color: var(--dark); }

  /* TABLE */
  .table-wrap {
    border: 1px solid var(--bmd);
    border-radius: 4px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    background: var(--white);
    color: var(--dark);
    border-bottom: 1.5px solid var(--dark);
    padding: 5px 5px;
    font-size: 8.5px;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td {
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 6px 5px;
    vertical-align: middle;
    font-size: 8.5px;
  }
  td:last-child { border-right: none; }
  .c-right  { text-align:right; }

  /* TOTAL */
  .total-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    border-top: 1.5px solid var(--bmd);
    background: var(--white);
  }
  .total-label {
    padding: 6px 10px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--blue);
  }
  .total-amount {
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 700;
    color: var(--dark);
    min-width: 116px;
    text-align: right;
  }

  /* WORDS */
  .words-block {
    margin-top: 8px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    font-size: 8.5px;
    color: var(--mid);
  }
  .words-block em { font-style: normal; font-weight: 600; color: var(--dark); }

  /* SIGNATURES */
  .sig-wrap { display: flex; justify-content: space-between; gap: 24px; margin-top: 40px; }
  .sig-block { flex: 1; }
  .sig-line { height: 1px; background: var(--bmd); margin-bottom: 4px; }
  .sig-lbl { font-size: 8.5px; color: var(--muted); text-align: center; }

  /* LEGAL */
  .legal-note {
    margin-top: 24px;
    padding: 6px 8px;
    border: 1px solid var(--bmd);
    border-radius: 4px;
    font-size: 7px;
    color: var(--muted);
    text-align: center;
    letter-spacing: 0.2px;
  }

  .doc-code { margin-top: 6px; text-align: right; font-size: 7px; color: var(--muted); }

  @page { size:A4; margin:0; }
  tr { page-break-inside:avoid; }
</style>
</head>
<body>
  <div class="document-copy">${buildDocumentContent()}</div>
</body>
</html>`;
}
