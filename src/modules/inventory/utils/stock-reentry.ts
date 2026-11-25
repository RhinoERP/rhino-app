export const STOCK_REENTRY_FALLBACK_CODE =
  "WAREHOUSE_FALLBACK_CONFIRMATION_REQUIRED";

export class StockReentryFallbackRequiredError extends Error {
  readonly code = STOCK_REENTRY_FALLBACK_CODE;
  constructor() {
    super(
      "El depósito original está desactivado. Confirmá si querés enviar el stock al depósito principal."
    );
    this.name = "StockReentryFallbackRequiredError";
  }
}

export function isStockReentryFallbackRequired(error: unknown): boolean {
  return (
    error instanceof StockReentryFallbackRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === STOCK_REENTRY_FALLBACK_CODE)
  );
}

export type StockReentryEntry = {
  sourceLotId: string;
  quantity: number;
  unitQuantity?: number | null;
  reason: string;
  operationKey: string;
};
