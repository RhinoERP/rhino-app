const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  efectivo: "Efectivo",
  credit_card: "Tarjeta de crédito",
  card_credit: "Tarjeta de crédito",
  tarjeta_de_credito: "Tarjeta de crédito",
  tarjeta_credito: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  card_debit: "Tarjeta de débito",
  tarjeta_de_debito: "Tarjeta de débito",
  tarjeta_debito: "Tarjeta de débito",
  transfer: "Transferencia",
  bank_transfer: "Transferencia",
  transferencia: "Transferencia",
  cheque: "Cheque",
  check: "Cheque",
  e_check: "E-cheq",
  echeq: "E-cheq",
  other: "Otro",
  otro: "Otro",
  deposito: "Depósito",
  card: "Tarjeta",
};

function normalizePaymentMethodKey(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function formatPosPaymentMethodLabel(paymentMethod: string): string {
  const normalized = normalizePaymentMethodKey(paymentMethod);
  return paymentMethodLabels[normalized] ?? paymentMethod;
}

export function isPosCashPaymentMethod(paymentMethod: string): boolean {
  const normalized = normalizePaymentMethodKey(paymentMethod);
  return normalized === "cash" || normalized === "efectivo";
}
