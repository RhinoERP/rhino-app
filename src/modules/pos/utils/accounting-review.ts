import type {
  EventoCobroPos,
  EventoVentaPos,
} from "@/modules/accounting/types";

export type PosAccountingReviewStep = "venta" | "cobro";

export type PosAccountingReviewFlow = {
  salePayload: EventoVentaPos | null;
  paymentPayload: EventoCobroPos | null;
  steps: PosAccountingReviewStep[];
  currentStepIndex: number;
};

export type PosAccountingReviewSequenceInput = {
  accountingStatus?: string | null;
  accountingSalePayload?: EventoVentaPos | null;
  accountingPaymentPayload?: EventoCobroPos | null;
};

const STORAGE_KEY = "rhino_pos_accounting_review";
let inMemoryReviewFlow: PosAccountingReviewFlow | null = null;

export function resolvePosAccountingReviewSequence(
  params: PosAccountingReviewSequenceInput
): PosAccountingReviewStep[] {
  if (params.accountingStatus !== "REVIEW_REQUIRED") {
    return [];
  }

  const steps: PosAccountingReviewStep[] = [];

  if (params.accountingSalePayload) {
    steps.push("venta");
  }

  if (params.accountingPaymentPayload) {
    steps.push("cobro");
  }

  return steps;
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
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.filter(
          (step): step is PosAccountingReviewStep =>
            step === "venta" || step === "cobro"
        )
      : [];

    if (steps.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      inMemoryReviewFlow = null;
      return null;
    }

    const currentStepIndex = Math.min(
      Math.max(0, Number(parsed.currentStepIndex ?? 0) || 0),
      steps.length - 1
    );

    const restored = {
      salePayload: parsed.salePayload ?? null,
      paymentPayload: parsed.paymentPayload ?? null,
      steps,
      currentStepIndex,
    };

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
