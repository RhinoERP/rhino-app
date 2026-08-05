const INVALID_AMOUNT_CHARS = /[^\d.,]/g;
const LEADING_ZEROES = /^0+(?=\d)/;

type AmountParts = {
  decimalPart: string;
  hasDecimalSeparator: boolean;
  integerPart: string;
};

type AmountFormatOptions = {
  maxDecimals?: number;
};

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getAmountParts(
  value: string,
  options?: AmountFormatOptions
): AmountParts {
  const maxDecimals = options?.maxDecimals ?? 4;
  const cleaned = value.replace(INVALID_AMOUNT_CHARS, "").trim();

  if (!cleaned) {
    return {
      decimalPart: "",
      hasDecimalSeparator: false,
      integerPart: "",
    };
  }

  const decimalSeparatorIndex = cleaned.lastIndexOf(",");
  const hasDecimalSeparator = decimalSeparatorIndex !== -1;

  const rawIntegerPart =
    decimalSeparatorIndex === -1
      ? cleaned
      : cleaned.slice(0, decimalSeparatorIndex);
  const rawDecimalPart =
    decimalSeparatorIndex === -1
      ? ""
      : cleaned.slice(decimalSeparatorIndex + 1);

  const integerDigits = rawIntegerPart.replace(/[.,]/g, "");
  const decimalDigits = rawDecimalPart
    .replace(/[.,]/g, "")
    .slice(0, maxDecimals);
  const integerPart = integerDigits.replace(LEADING_ZEROES, "") || "0";

  return {
    decimalPart: decimalDigits,
    hasDecimalSeparator,
    integerPart,
  };
}

export function formatAmountInput(
  value: string,
  options?: AmountFormatOptions
): string {
  const { decimalPart, hasDecimalSeparator, integerPart } = getAmountParts(
    value,
    options
  );

  if (!(integerPart || decimalPart)) {
    return "";
  }

  const groupedIntegerPart = groupThousands(integerPart || "0");

  if (!hasDecimalSeparator) {
    return groupedIntegerPart;
  }

  return `${groupedIntegerPart},${decimalPart}`;
}

export function formatNormalizedAmountInput(
  value: string,
  options?: AmountFormatOptions
): string {
  return formatAmountInput(value.replace(".", ","), options);
}

export function normalizeAmountInput(
  value: string,
  options?: AmountFormatOptions
): string {
  const { decimalPart, hasDecimalSeparator, integerPart } = getAmountParts(
    value,
    options
  );

  if (!(integerPart || decimalPart)) {
    return "";
  }

  if (!hasDecimalSeparator || decimalPart.length === 0) {
    return integerPart || "0";
  }

  return `${integerPart || "0"}.${decimalPart}`;
}

export function parseAmountInput(
  value: string,
  options?: AmountFormatOptions
): number {
  const normalized = normalizeAmountInput(value, options);

  return normalized ? Number.parseFloat(normalized) || 0 : 0;
}

export function isValidAmountInput(
  value: string,
  options?: AmountFormatOptions
): boolean {
  const normalized = normalizeAmountInput(value, options);

  if (!normalized) {
    return false;
  }

  const maxDecimals = options?.maxDecimals ?? 4;
  const amountPattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);

  return amountPattern.test(normalized);
}
