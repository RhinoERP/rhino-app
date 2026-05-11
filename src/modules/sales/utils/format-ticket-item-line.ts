import { abbreviateTicketProductName } from "./abbreviate-ticket-product-name";

const DIGIT_PATTERN = /\d/;

export type TicketItemOverflowMode = "truncate" | "wrap";

export type TicketItemColumnWidths = {
  quantity: number;
  product: number;
  price: number;
  subtotal: number;
};

type FormatTicketItemLinesInput = {
  quantity: string;
  product: string;
  price: string;
  subtotal: string;
  widths: TicketItemColumnWidths;
  overflowMode?: TicketItemOverflowMode;
};

function normalizeCellText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeWidth(width: number): number {
  return Math.max(0, Math.floor(width));
}

function fitLeft(value: string, width: number): string {
  const normalizedWidth = normalizeWidth(width);
  const cleanValue = normalizeCellText(value).slice(0, normalizedWidth);

  return cleanValue.padEnd(normalizedWidth);
}

function fitRight(value: string, width: number): string {
  const normalizedWidth = normalizeWidth(width);

  if (normalizedWidth <= 0) {
    return "";
  }

  const cleanValue = normalizeCellText(value);
  const fittedValue =
    cleanValue.length > normalizedWidth
      ? cleanValue.slice(-normalizedWidth)
      : cleanValue;

  return fittedValue.padStart(normalizedWidth);
}

function abbreviateWord(value: string, width: number): string {
  const normalizedWidth = normalizeWidth(width);

  if (value.length <= normalizedWidth) {
    return value;
  }

  if (normalizedWidth <= 1 || DIGIT_PATTERN.test(value)) {
    return value.slice(0, normalizedWidth);
  }

  return `${value.slice(0, normalizedWidth - 1)}.`;
}

function buildAbbreviatedProductCandidate(
  words: string[],
  firstLength: number,
  restLength: number,
  width: number
): string {
  const candidateWords: string[] = [];

  for (const [index, word] of words.entries()) {
    const abbreviatedWord = abbreviateWord(
      word,
      index === 0 ? firstLength : restLength
    );
    const candidate = [...candidateWords, abbreviatedWord].join(" ");

    if (candidate.length > width) {
      break;
    }

    candidateWords.push(abbreviatedWord);
  }

  return candidateWords.join(" ");
}

function resolveBestAbbreviatedProduct(words: string[], width: number): string {
  let bestCandidate = "";
  let bestWordCount = 0;

  for (let firstLength = 5; firstLength >= 3; firstLength -= 1) {
    for (let restLength = 5; restLength >= 3; restLength -= 1) {
      const candidate = buildAbbreviatedProductCandidate(
        words,
        firstLength,
        restLength,
        width
      );
      const wordCount = candidate ? candidate.split(" ").length : 0;

      if (
        wordCount > bestWordCount ||
        (wordCount === bestWordCount && candidate.length > bestCandidate.length)
      ) {
        bestCandidate = candidate;
        bestWordCount = wordCount;
      }
    }
  }

  return bestCandidate;
}

function abbreviateProductName(value: string, width: number): string {
  const normalizedWidth = normalizeWidth(width);
  const cleanValue = normalizeCellText(value);

  if (cleanValue.length <= normalizedWidth) {
    return cleanValue;
  }

  if (normalizedWidth <= 0) {
    return "";
  }

  const words = cleanValue.split(" ").filter(Boolean);

  if (words.length <= 1) {
    return abbreviateTicketProductName(cleanValue, normalizedWidth);
  }

  const bestCandidate = resolveBestAbbreviatedProduct(words, normalizedWidth);

  if (bestCandidate) {
    return bestCandidate;
  }

  return abbreviateTicketProductName(cleanValue, normalizedWidth);
}

function splitLongWord(value: string, width: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += width) {
    chunks.push(value.slice(index, index + width));
  }

  return chunks;
}

function wrapProductName(value: string, width: number): string[] {
  const normalizedWidth = normalizeWidth(width);
  const cleanValue = normalizeCellText(value);

  if (normalizedWidth <= 0) {
    return [""];
  }

  if (!cleanValue) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of cleanValue.split(" ")) {
    if (word.length > normalizedWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      lines.push(...splitLongWord(word, normalizedWidth));
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= normalizedWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

export function formatTicketItemLines({
  quantity,
  product,
  price,
  subtotal,
  widths,
  overflowMode = "truncate",
}: FormatTicketItemLinesInput): string[] {
  const quantityCell = fitLeft(quantity, widths.quantity);
  const priceCell = fitRight(price, widths.price);
  const subtotalCell = fitRight(subtotal, widths.subtotal);
  const productWidth = normalizeWidth(widths.product);

  if (overflowMode === "truncate") {
    const productCell = fitLeft(
      abbreviateProductName(product, productWidth),
      productWidth
    );

    return [`${quantityCell} ${productCell} ${priceCell} ${subtotalCell}`];
  }

  const productLines = wrapProductName(product, productWidth);
  const firstProductCell = fitLeft(productLines[0] ?? "", productWidth);
  const continuationIndent = " ".repeat(normalizeWidth(widths.quantity) + 1);

  return [
    `${quantityCell} ${firstProductCell} ${priceCell} ${subtotalCell}`,
    ...productLines
      .slice(1)
      .map((line) => `${continuationIndent}${fitLeft(line, productWidth)}`),
  ];
}
