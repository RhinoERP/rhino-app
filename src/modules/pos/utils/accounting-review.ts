import type { EventoVentaPos } from "@/modules/accounting/types";

export type PosAccountingReviewStep = "venta";

export type PosAccountingReviewFlow = {
  salePayload: EventoVentaPos | null;
};

export type PosAccountingReviewSequenceInput = {
  accountingStatus?: string | null;
  accountingSalePayload?: EventoVentaPos | null;
};

const STORAGE_KEY = "rhino_pos_accounting_review";
let inMemoryReviewFlow: PosAccountingReviewFlow | null = null;

export function resolvePosAccountingReviewSequence(
  params: PosAccountingReviewSequenceInput
): PosAccountingReviewStep[] {
  if (params.accountingStatus !== "REVIEW_REQUIRED") {
    return [];
  }

  return params.accountingSalePayload ? ["venta"] : [];
}

export function savePosAccountingReviewFlow(flow: PosAccountingReviewFlow) {
  inMemoryReviewFlow = flow;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  } catch {
    // Ignore storage quota / private-mode failures.
  }
}

export function restorePosAccountingReviewFlow(): PosAccountingReviewFlow | null {
  if (typeof window === "undefined") {
    return inMemoryReviewFlow;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return inMemoryReviewFlow;
    }

    const parsed = JSON.parse(raw) as Partial<PosAccountingReviewFlow>;
    if (!parsed.salePayload) {
      window.localStorage.removeItem(STORAGE_KEY);
      inMemoryReviewFlow = null;
      return null;
    }

    const restored = { salePayload: parsed.salePayload };

    inMemoryReviewFlow = restored;
    return restored;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    inMemoryReviewFlow = null;
    return null;
  }
}

export function clearPosAccountingReviewFlow() {
  inMemoryReviewFlow = null;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors when clearing the review flow.
  }
}
