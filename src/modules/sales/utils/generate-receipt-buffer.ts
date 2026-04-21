import type {
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
} from "../types";

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

function centerText(value: string, width: number): string {
  const cleanValue = sanitizeEscPosText(value);
  if (cleanValue.length >= width) {
    return cleanValue.slice(0, width);
  }

  const leftPadding = Math.floor((width - cleanValue.length) / 2);
  return `${" ".repeat(leftPadding)}${cleanValue}`;
}

function splitLongWord(word: string, width: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += width) {
    chunks.push(word.slice(index, index + width));
  }
  return chunks.length ? chunks : [""];
}

function appendWordToLines(lines: string[], word: string, width: number): void {
  if (!word) {
    return;
  }

  const lastIndex = lines.length - 1;
  const currentLine = lines[lastIndex];
  if (!currentLine) {
    lines[lastIndex] = word;
    return;
  }

  if (currentLine.length + 1 + word.length <= width) {
    lines[lastIndex] = `${currentLine} ${word}`;
    return;
  }

  lines.push(word);
}

function wrapText(value: string, width: number): string[] {
  const cleanValue = sanitizeEscPosText(value);
  if (!cleanValue) {
    return [""];
  }

  const lines = [""];
  for (const currentWord of cleanValue.split(" ").filter(Boolean)) {
    if (currentWord.length <= width) {
      appendWordToLines(lines, currentWord, width);
      continue;
    }

    if (lines.at(-1)) {
      lines.push("");
    }

    for (const chunk of splitLongWord(currentWord, width)) {
      appendWordToLines(lines, chunk, width);
    }
  }

  return lines.filter((line, index) => line || index === 0);
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

function formatTicketDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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

export function generateReceiptBuffer({
  company,
  sale,
  lineWidth = DEFAULT_LINE_WIDTH,
}: GenerateReceiptBufferInput): Uint8Array {
  const bytes: number[] = [];
  const separator = "-".repeat(lineWidth);
  const quantityWidth = 5;
  const priceWidth = 10;
  const subtotalWidth = 12;
  const productWidth = Math.max(
    10,
    lineWidth - quantityWidth - priceWidth - subtotalWidth - 3
  );
  const totalLabelWidth = Math.max(10, lineWidth - subtotalWidth - 1);
  const formattedDate = formatTicketDate(sale.saleDate);
  const companyName = company.name.trim() || "Empresa de prueba";

  writeCommand(bytes, ESC, 0x40); // Initialize printer
  writeCommand(bytes, ESC, 0x74, 0x00); // Code table (CP437)

  writeCommand(bytes, ESC, 0x61, 0x01); // Center align
  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(bytes, centerText(companyName, lineWidth));
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off

  if (sale.saleNumber) {
    writeLine(bytes, centerText(`Ticket: ${sale.saleNumber}`, lineWidth));
  }

  if (formattedDate) {
    writeLine(bytes, centerText(`Fecha: ${formattedDate}`, lineWidth));
  }

  writeLine(bytes);

  writeCommand(bytes, ESC, 0x61, 0x00); // Left align
  writeLine(bytes, separator);
  writeLine(
    bytes,
    `${"Cant".padEnd(quantityWidth)} ${"Producto".padEnd(productWidth)} ${"Precio".padStart(priceWidth)} ${"Subtotal".padStart(subtotalWidth)}`
  );
  writeLine(bytes, separator);

  if (!sale.items.length) {
    writeLine(bytes, "Sin items en la venta.");
  }

  for (const item of sale.items) {
    const qtyCell = formatQuantity(item.quantity).padEnd(quantityWidth);
    const priceCell = formatMoney(resolveUnitPrice(item)).padStart(priceWidth);
    const subtotalCell = formatMoney(item.subtotal).padStart(subtotalWidth);
    const wrappedProduct = wrapText(item.product, productWidth);

    wrappedProduct.forEach((line, index) => {
      if (index === 0) {
        writeLine(
          bytes,
          `${qtyCell} ${line.padEnd(productWidth)} ${priceCell} ${subtotalCell}`
        );
        return;
      }

      writeLine(
        bytes,
        `${" ".repeat(quantityWidth)} ${line.padEnd(productWidth)} ${" ".repeat(priceWidth)} ${" ".repeat(subtotalWidth)}`
      );
    });
  }

  writeLine(bytes, separator);
  writeLine(
    bytes,
    `${"Subtotal".padEnd(totalLabelWidth)} ${formatMoney(sale.subtotal).padStart(subtotalWidth)}`
  );

  writeCommand(bytes, ESC, 0x45, 0x01); // Bold on
  writeLine(
    bytes,
    `${"Total".padEnd(totalLabelWidth)} ${formatMoney(sale.total).padStart(subtotalWidth)}`
  );
  writeCommand(bytes, ESC, 0x45, 0x00); // Bold off

  writeLine(bytes);
  writeCommand(bytes, ESC, 0x61, 0x01); // Center align
  writeLine(bytes, centerText("Gracias por su compra", lineWidth));
  writeLine(bytes);
  writeLine(bytes);

  writeCommand(bytes, ESC, 0x70, 0x00, 0x3c, 0xff); // Open cash drawer
  writeCommand(bytes, GS, 0x56, 0x00); // Full cut

  return new Uint8Array(bytes);
}
