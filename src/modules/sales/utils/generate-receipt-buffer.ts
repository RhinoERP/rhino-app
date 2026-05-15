import type {
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
  TicketSaleTax,
} from "../types";
import { formatTicketItemLines } from "./format-ticket-item-line";
import {
  formatCaeExpirationDate,
  formatTicketPaymentMethod,
} from "./ticket-fiscal";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const DEFAULT_LINE_WIDTH = 48;

type GenerateReceiptBufferInput = {
  company: TicketCompanyData;
  sale: TicketSaleData;
  lineWidth?: number;
};

function sanitizeEscPosText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r\n/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7e]/g, " ");
}

function textToBytes(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0));
}

function writeBytes(target: number[], bytes: number[]): void {
  target.push(...bytes);
}

function writeCommand(target: number[], ...bytes: number[]): void {
  writeBytes(target, bytes);
}

function writeLine(target: number[], value = ""): void {
  writeBytes(target, textToBytes(sanitizeEscPosText(value)));
  target.push(LF);
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value: number): string {
  return `$ ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fitLabel(value: string, width: number): string {
  const cleanValue = sanitizeEscPosText(value);
  if (cleanValue.length > width) {
    return cleanValue.slice(0, width);
  }

  return cleanValue.padEnd(width);
}

function formatTaxLabel(tax: TicketSaleTax): string {
  const rate = Number(tax.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return tax.name;
  }

  return `${tax.name} (${rate.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%)`;
}

function formatTicketDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear() % 100).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hours}:${minutes} hs.`;
}

function resolveUnitPrice(item: TicketSaleItem): number {
  if (typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)) {
    return item.unitPrice;
  }

  if (item.quantity > 0) {
    return item.subtotal / item.quantity;
  }

  return item.subtotal;
}

type QuantityColumnMode = "units" | "weight" | "mixed";

function isWeightQuantityItem(item: TicketSaleItem): boolean {
  if (item.quantityKind) {
    return item.quantityKind === "weight";
  }

  return !Number.isInteger(item.quantity);
}

function resolveQuantityColumnMode(
  items: TicketSaleItem[]
): QuantityColumnMode {
  let hasUnits = false;
  let hasWeight = false;

  for (const item of items) {
    if (isWeightQuantityItem(item)) {
      hasWeight = true;
    } else {
      hasUnits = true;
    }

    if (hasUnits && hasWeight) {
      return "mixed";
    }
  }

  return hasWeight ? "weight" : "units";
}

function resolveQuantityHeader(): string {
  return "Cantidad/Kg";
}

function formatQuantityCell(
  item: TicketSaleItem,
  mode: QuantityColumnMode
): string {
  const quantity = formatQuantity(item.quantity);

  if (mode !== "mixed") {
    return quantity;
  }

  return `${quantity}${isWeightQuantityItem(item) ? "kg" : "u"}`;
}

function writeReceiptHeader(params: {
  bytes: number[];
  companyCuit: string;
  companyName: string;
  formattedDate: string | null;
  saleNumber?: string | null;
}) {
  const { bytes, companyCuit, companyName, formattedDate } = params;

  writeCommand(bytes, ESC, 0x61, 0x01); // Center align
  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(bytes, companyName);
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off
  writeLine(bytes, `CUIT: ${companyCuit}`);

  if (params.saleNumber) {
    writeLine(bytes, `Ticket: ${params.saleNumber}`);
  }

  if (formattedDate) {
    writeLine(bytes, `Fecha: ${formattedDate}`);
  }

  writeLine(bytes, "Gracias por su compra");
  writeLine(bytes);
}

function writeSaleItemRows(params: {
  bytes: number[];
  items: TicketSaleItem[];
  quantityColumnMode: QuantityColumnMode;
  widths: {
    quantity: number;
    product: number;
    price: number;
    subtotal: number;
  };
}) {
  const { bytes, items, quantityColumnMode, widths } = params;

  if (!items.length) {
    writeLine(bytes, "Sin items en la venta.");
    return;
  }

  for (const item of items) {
    const itemLines = formatTicketItemLines({
      quantity: formatQuantityCell(item, quantityColumnMode),
      product: sanitizeEscPosText(item.product),
      price: formatMoney(resolveUnitPrice(item)),
      subtotal: formatMoney(item.subtotal),
      widths,
      overflowMode: "truncate",
    });

    for (const itemLine of itemLines) {
      writeLine(bytes, itemLine);
    }
  }
}

function writeTaxLines(params: {
  bytes: number[];
  fallbackTaxAmount: number;
  subtotalWidth: number;
  taxes: TicketSaleTax[];
  totalLabelWidth: number;
}) {
  const { bytes, fallbackTaxAmount, subtotalWidth, taxes, totalLabelWidth } =
    params;

  if (taxes.length > 0) {
    for (const tax of taxes) {
      writeLine(
        bytes,
        `${fitLabel(formatTaxLabel(tax), totalLabelWidth)} ${formatMoney(tax.amount).padStart(subtotalWidth)}`
      );
    }
    return;
  }

  if (fallbackTaxAmount > 0) {
    writeLine(
      bytes,
      `${"Impuestos".padEnd(totalLabelWidth)} ${formatMoney(fallbackTaxAmount).padStart(subtotalWidth)}`
    );
  }
}

function writeFiscalFooter(params: {
  bytes: number[];
  cae: string | null;
  caeExpirationDate: string | null;
  paymentMethod: string | null;
  separator: string;
}) {
  const { bytes, cae, caeExpirationDate, paymentMethod, separator } = params;

  if (!(paymentMethod || cae || caeExpirationDate)) {
    return;
  }

  writeLine(bytes, separator);
  if (paymentMethod) {
    writeLine(bytes, `Medio de pago: ${paymentMethod}`);
  }
  if (cae) {
    writeLine(bytes, `CAE: ${cae}`);
  }
  if (caeExpirationDate) {
    writeLine(bytes, `Vto. CAE: ${caeExpirationDate}`);
  }
}

export function generateReceiptBuffer({
  company,
  sale,
  lineWidth = DEFAULT_LINE_WIDTH,
}: GenerateReceiptBufferInput): Uint8Array {
  const bytes: number[] = [];
  const separator = "-".repeat(lineWidth);
  const quantityColumnMode = resolveQuantityColumnMode(sale.items);
  const quantityHeader = resolveQuantityHeader();
  const quantityWidth = Math.max(8, quantityHeader.length);
  const priceWidth = 10;
  const subtotalWidth = 12;
  const productWidth = Math.max(
    10,
    lineWidth - quantityWidth - priceWidth - subtotalWidth - 3
  );
  const totalLabelWidth = Math.max(10, lineWidth - subtotalWidth - 1);
  const formattedDate = formatTicketDate(sale.printedAt ?? sale.saleDate);
  const companyName = company.name.trim() || "Empresa de prueba";
  const companyCuit = company.cuit.trim() || "No informado";
  const paymentMethod = formatTicketPaymentMethod(sale.paymentMethod);
  const cae = sale.cae?.trim() || null;
  const caeExpirationDate = formatCaeExpirationDate(sale.caeExpirationDate);
  const ticketTaxes = (sale.taxes ?? []).filter(
    (tax) => Number.isFinite(tax.amount) && tax.amount > 0
  );
  const fallbackTaxAmount =
    typeof sale.taxAmount === "number" &&
    Number.isFinite(sale.taxAmount) &&
    sale.taxAmount > 0
      ? sale.taxAmount
      : 0;

  writeCommand(bytes, ESC, 0x40); // Initialize printer
  writeCommand(bytes, ESC, 0x74, 0x00); // Code table (CP437)

  writeReceiptHeader({
    bytes,
    companyCuit,
    companyName,
    formattedDate,
    saleNumber: sale.saleNumber,
  });

  writeCommand(bytes, ESC, 0x61, 0x00); // Left align
  writeLine(bytes, separator);
  writeLine(
    bytes,
    `${quantityHeader.padEnd(quantityWidth)} ${"Producto".padEnd(productWidth)} ${"Precio".padStart(priceWidth)} ${"Subtotal".padStart(subtotalWidth)}`
  );
  writeLine(bytes, separator);

  writeSaleItemRows({
    bytes,
    items: sale.items,
    quantityColumnMode,
    widths: {
      quantity: quantityWidth,
      product: productWidth,
      price: priceWidth,
      subtotal: subtotalWidth,
    },
  });

  writeLine(bytes, separator);
  writeLine(
    bytes,
    `${"Subtotal".padEnd(totalLabelWidth)} ${formatMoney(sale.subtotal).padStart(subtotalWidth)}`
  );

  writeTaxLines({
    bytes,
    fallbackTaxAmount,
    subtotalWidth,
    taxes: ticketTaxes,
    totalLabelWidth,
  });

  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(
    bytes,
    `${"Total".padEnd(totalLabelWidth)} ${formatMoney(sale.total).padStart(subtotalWidth)}`
  );
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off

  writeFiscalFooter({
    bytes,
    cae,
    caeExpirationDate,
    paymentMethod,
    separator,
  });

  writeLine(bytes, " ");
  writeLine(bytes, " ");

  writeCommand(bytes, ESC, 0x70, 0x00, 0x3c, 0xff); // Open cash drawer
  writeCommand(bytes, GS, 0x56, 0x42, 0x00); // Cut after feed

  return new Uint8Array(bytes);
}
