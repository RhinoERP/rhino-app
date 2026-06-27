import type {
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
  TicketSaleTax,
} from "../types";
import { formatTicketItemLines } from "./format-ticket-item-line";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const DEFAULT_LINE_WIDTH = 48;
const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function writeCenteredLine(target: number[], value = ""): void {
  writeCommand(target, ESC, 0x61, 0x01);
  writeLine(target, value);
  writeCommand(target, ESC, 0x61, 0x00);
}

function writeQrCode(target: number[], value: string, moduleSize = 4): void {
  const data = Array.from(value, (char) => char.charCodeAt(0));
  const storeLength = data.length + 3;
  const pL = storeLength % 256;
  const pH = Math.floor(storeLength / 256);
  const size = Math.min(16, Math.max(1, Math.round(moduleSize)));

  writeCommand(target, GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  writeCommand(target, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);
  writeCommand(target, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  writeCommand(target, GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
  writeBytes(target, data);
  writeCommand(target, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function normalizeComparableText(value: string | null | undefined): string {
  return sanitizeEscPosText(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isFinalConsumerText(value: string | null | undefined): boolean {
  const normalized = normalizeComparableText(value);
  return normalized === "consumidor final";
}

function formatPrintableCompanyAddress(
  value: string | null | undefined
): string | null {
  const address = sanitizeEscPosText(value ?? "").trim();
  const normalized = normalizeComparableText(address);

  if (
    !address ||
    normalized === "direccion no informada" ||
    normalized === "no informado"
  ) {
    return null;
  }

  return address;
}

function buildReceiverLines(
  receiver: NonNullable<TicketSaleData["receiver"]>
): string[] {
  const lines: string[] = [];
  const name = sanitizeEscPosText(receiver.name).trim();
  const documentLabel = sanitizeEscPosText(receiver.documentLabel ?? "").trim();
  const vatCondition = sanitizeEscPosText(receiver.vatCondition ?? "").trim();

  if (name) {
    lines.push(name);
  }

  if (
    documentLabel &&
    normalizeComparableText(documentLabel) !== normalizeComparableText(name)
  ) {
    lines.push(documentLabel);
  }

  if (
    vatCondition &&
    normalizeComparableText(vatCondition) !== normalizeComparableText(name) &&
    normalizeComparableText(vatCondition) !==
      normalizeComparableText(documentLabel) &&
    !(isFinalConsumerText(name) && isFinalConsumerText(vatCondition))
  ) {
    lines.push(`IVA: ${vatCondition}`);
  }

  return lines.length > 0 ? lines : ["Consumidor final"];
}

function isIvaTax(tax: TicketSaleTax): boolean {
  return normalizeComparableText(tax.name).includes("iva");
}

function sumTaxAmounts(taxes: TicketSaleTax[]): number {
  return roundMoney(taxes.reduce((sum, tax) => sum + tax.amount, 0));
}

function resolveFiscalTaxDisclosure(params: {
  taxes: TicketSaleTax[];
  fallbackTaxAmount: number;
}): {
  totalTaxAmount: number;
  containedVatAmount: number;
  otherIndirectAmount: number;
} {
  const { taxes, fallbackTaxAmount } = params;

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
  const totalTaxAmount = sumTaxAmounts(taxes);

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
  const taxAmount = Math.max(0, params.taxAmount);
  const computedGrossSubtotal = roundMoney(subtotal + taxAmount);

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
          : roundMoney(resolveUnitPrice(item) * ratio),
      subtotal,
    };
  });
}

function formatTicketDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (ISO_DATE_PATTERN.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ESC/POS assembly is linear but has fiscal/internal branches.
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
  const formattedDate = formatTicketDate(sale.saleDate);
  const fiscal = sale.fiscal ?? null;
  const companyName = company.name.trim() || "Empresa de prueba";
  const companyAddress = formatPrintableCompanyAddress(company.address);
  const ticketTaxes = (sale.taxes ?? []).filter(
    (tax) => Number.isFinite(tax.amount) && tax.amount > 0
  );
  const fallbackTaxAmount =
    typeof sale.taxAmount === "number" &&
    Number.isFinite(sale.taxAmount) &&
    sale.taxAmount > 0
      ? sale.taxAmount
      : 0;
  const fiscalTaxDisclosure = resolveFiscalTaxDisclosure({
    taxes: ticketTaxes,
    fallbackTaxAmount,
  });
  const displaySubtotal = fiscal
    ? resolveFiscalGrossSubtotal({
        subtotal: sale.subtotal,
        total: sale.total,
        taxAmount: fiscalTaxDisclosure.totalTaxAmount,
      })
    : sale.subtotal;
  const discountAmount = fiscal
    ? roundMoney(Math.max(0, displaySubtotal - sale.total))
    : 0;
  const printableItems = resolvePrintableItems(sale, displaySubtotal);

  writeCommand(bytes, ESC, 0x40); // Initialize printer
  writeCommand(bytes, ESC, 0x74, 0x00); // Code table (CP437)

  writeCommand(bytes, ESC, 0x61, 0x01); // Center align
  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(bytes, companyName);
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off

  if (companyAddress) {
    writeLine(bytes, companyAddress);
  }
  writeLine(bytes, `CUIT: ${company.cuit}`);

  if (company.vatCondition) {
    writeLine(bytes, `IVA: ${company.vatCondition}`);
  }

  if (company.grossIncomeNumber) {
    writeLine(bytes, `IIBB: ${company.grossIncomeNumber}`);
  }

  if (company.activityStartDate) {
    writeLine(
      bytes,
      `Inicio Actividades: ${formatDateOnly(company.activityStartDate) ?? company.activityStartDate}`
    );
  }

  writeLine(bytes);

  if (fiscal) {
    writeLine(bytes, "+-------------+");
    writeCommand(bytes, ESC, 0x45, 0x01);
    writeLine(bytes, `|      ${fiscal.letter}      |`);
    writeCommand(bytes, ESC, 0x45, 0x00);
    writeLine(
      bytes,
      `|  Cod. ${String(fiscal.voucherTypeCode).padStart(3, "0")}  |`
    );
    writeLine(bytes, "+-------------+");
    writeCommand(bytes, ESC, 0x45, 0x01);
    writeLine(bytes, `TICKET FACTURA ${fiscal.letter}`);
    writeCommand(bytes, ESC, 0x45, 0x00);
    writeLine(
      bytes,
      `PV ${String(fiscal.pointOfSale).padStart(5, "0")} Nro ${String(fiscal.voucherNumber).padStart(8, "0")}`
    );
  } else {
    writeCommand(bytes, ESC, 0x45, 0x01);
    writeLine(bytes, "TICKET INTERNO");
    writeCommand(bytes, ESC, 0x45, 0x00);
    writeLine(bytes, "NO VALIDO COMO FACTURA");

    if (sale.saleNumber) {
      writeLine(bytes, `Ticket: ${sale.saleNumber}`);
    }
  }

  if (formattedDate) {
    writeLine(bytes, `Emision: ${formattedDate}`);
  }

  if (sale.receiver) {
    writeLine(bytes);
    writeLine(bytes, "Receptor:");
    for (const receiverLine of buildReceiverLines(sale.receiver)) {
      writeLine(bytes, receiverLine);
    }
  }

  writeLine(bytes);

  writeCommand(bytes, ESC, 0x61, 0x00); // Left align
  writeLine(bytes, separator);
  writeLine(
    bytes,
    `${quantityHeader.padEnd(quantityWidth)} ${"Producto".padEnd(productWidth)} ${"Precio".padStart(priceWidth)} ${"Subtotal".padStart(subtotalWidth)}`
  );
  writeLine(bytes, separator);

  if (!printableItems.length) {
    writeLine(bytes, "Sin items en la venta.");
  }

  for (const item of printableItems) {
    const itemLines = formatTicketItemLines({
      quantity: formatQuantityCell(item, quantityColumnMode),
      product: sanitizeEscPosText(item.product),
      price: formatMoney(resolveUnitPrice(item)),
      subtotal: formatMoney(item.subtotal),
      widths: {
        quantity: quantityWidth,
        product: productWidth,
        price: priceWidth,
        subtotal: subtotalWidth,
      },
      overflowMode: "truncate",
    });

    for (const itemLine of itemLines) {
      writeLine(bytes, itemLine);
    }
  }

  writeLine(bytes, separator);

  if (fiscal && fiscalTaxDisclosure.totalTaxAmount > 0) {
    writeLine(bytes, "REG. FISCAL (LEY 27.743)");
    writeLine(
      bytes,
      `${"IVA CONTENIDO:".padEnd(totalLabelWidth)} ${formatMoney(fiscalTaxDisclosure.containedVatAmount).padStart(subtotalWidth)}`
    );
    writeLine(
      bytes,
      `${fitLabel("OTROS IMP. NAC. INDIRECTOS:", totalLabelWidth)} ${formatMoney(fiscalTaxDisclosure.otherIndirectAmount).padStart(subtotalWidth)}`
    );
    writeLine(bytes, separator);
  }

  writeLine(
    bytes,
    `${"Subtotal".padEnd(totalLabelWidth)} ${formatMoney(displaySubtotal).padStart(subtotalWidth)}`
  );

  if (fiscal && discountAmount > 0) {
    writeLine(
      bytes,
      `${"Descuento".padEnd(totalLabelWidth)} ${formatMoney(discountAmount).padStart(subtotalWidth)}`
    );
  }

  if (!fiscal && ticketTaxes.length > 0) {
    for (const tax of ticketTaxes) {
      writeLine(
        bytes,
        `${fitLabel(formatTaxLabel(tax), totalLabelWidth)} ${formatMoney(tax.amount).padStart(subtotalWidth)}`
      );
    }
  } else if (!fiscal && fallbackTaxAmount > 0) {
    writeLine(
      bytes,
      `${"Impuestos".padEnd(totalLabelWidth)} ${formatMoney(fallbackTaxAmount).padStart(subtotalWidth)}`
    );
  }

  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(
    bytes,
    `${"Total".padEnd(totalLabelWidth)} ${formatMoney(sale.total).padStart(subtotalWidth)}`
  );
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off

  if (fiscal) {
    writeLine(bytes, separator);
    writeLine(bytes, `CAE: ${fiscal.cae}`);
    writeLine(
      bytes,
      `Vto. CAE: ${formatDateOnly(fiscal.caeExpirationDate) ?? fiscal.caeExpirationDate}`
    );
    writeLine(bytes);
    writeCenteredLine(bytes, "QR fiscal ARCA");
    writeCommand(bytes, ESC, 0x61, 0x01);
    writeQrCode(bytes, fiscal.qrUrl, 4);
    writeCommand(bytes, ESC, 0x61, 0x00);
    writeCenteredLine(bytes, "Escanee para validar");
  } else {
    writeLine(bytes, separator);
    writeCenteredLine(bytes, "Gracias por su compra");
  }

  writeLine(bytes, " ");
  writeLine(bytes, " ");

  writeCommand(bytes, ESC, 0x70, 0x00, 0x3c, 0xff); // Open cash drawer
  writeCommand(bytes, GS, 0x56, 0x42, 0x00); // Cut after feed

  return new Uint8Array(bytes);
}
