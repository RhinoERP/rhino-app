import { truncateMoney } from "../../../lib/decimal";

export const CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE =
  "Se requiere una descripción justificando la diferencia de caja";

export class ClosePosSessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosePosSessionValidationError";
  }
}

function sanitizeTextValue(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCloseSessionNotes(params: {
  notes?: string | null;
  description?: string | null;
}): string | null {
  const sanitizedNotes = sanitizeTextValue(params.notes);

  if (sanitizedNotes) {
    return sanitizedNotes;
  }

  return sanitizeTextValue(params.description);
}

export function calculateCloseSessionDifferenceAmount(params: {
  expectedCashEnd: number;
  realCashEnd: number;
}): number {
  const normalizedExpectedCashEnd = truncateMoney(
    Number(params.expectedCashEnd)
  );
  const normalizedRealCashEnd = truncateMoney(Number(params.realCashEnd));

  return truncateMoney(normalizedRealCashEnd - normalizedExpectedCashEnd);
}

export function validateCloseSessionDifferenceJustification(params: {
  expectedCashEnd: number;
  realCashEnd: number;
  notes?: string | null;
  description?: string | null;
}): {
  differenceAmount: number;
  notes: string | null;
} {
  const differenceAmount = calculateCloseSessionDifferenceAmount({
    expectedCashEnd: params.expectedCashEnd,
    realCashEnd: params.realCashEnd,
  });

  const notes = resolveCloseSessionNotes({
    notes: params.notes,
    description: params.description,
  });

  if (differenceAmount !== 0 && !notes) {
    throw new ClosePosSessionValidationError(
      CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE
    );
  }

  return { differenceAmount, notes };
}
