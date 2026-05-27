export type PaymentMethodType =
  | "transfer"
  | "check"
  | "retention_iibb"
  | "retention_gcias"
  | "retention_suss"
  | "cash";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  transfer: "Transferencia bancaria",
  check: "Cheque propio",
  retention_iibb: "Retención IIBB",
  retention_gcias: "Retención Ganancias",
  retention_suss: "Retención SUSS",
  cash: "Efectivo",
};

// Métodos que restan del total (retenciones)
export const RETENTION_METHODS: PaymentMethodType[] = [
  "retention_iibb",
  "retention_gcias",
  "retention_suss",
];

export type PaymentMethodLine = {
  id: string; // UUID local para el formulario
  method_type: PaymentMethodType;
  amount: number;
  reference?: string;
  bank_name?: string;
  due_date?: string;
};

export type InvoiceToCancel = {
  purchase_order_id: string;
  purchase_number: number | null;
  supplier_name: string;
  total_amount: number;
  amount_applied: number; // cuánto de esta factura se cancela en esta orden
};

export type CreatePaymentOrderInput = {
  orgSlug: string;
  supplier_id: string;
  payment_date: string;
  invoices: InvoiceToCancel[];
  methods: Omit<PaymentMethodLine, "id">[];
  notes?: string;
};

export type PaymentOrderSummary = {
  totalInvoices: number;    // suma de amount_applied en facturas
  totalPayments: number;    // suma de métodos NO retenciones
  totalRetentions: number;  // suma de retenciones (descuentan)
  netPayment: number;       // totalPayments - totalRetentions
  balance: number;          // totalInvoices - netPayment (debe ser 0)
  isBalanced: boolean;      // balance === 0 (con tolerancia de $0.01)
};

export function calculatePaymentSummary(
  invoices: InvoiceToCancel[],
  methods: PaymentMethodLine[]
): PaymentOrderSummary {
  const totalInvoices = invoices.reduce((s, i) => s + i.amount_applied, 0);
  const totalPayments = methods
    .filter((m) => !RETENTION_METHODS.includes(m.method_type))
    .reduce((s, m) => s + m.amount, 0);
  const totalRetentions = methods
    .filter((m) => RETENTION_METHODS.includes(m.method_type))
    .reduce((s, m) => s + m.amount, 0);
  const netPayment = totalPayments - totalRetentions;
  const balance = Math.abs(totalInvoices - netPayment);

  return {
    totalInvoices,
    totalPayments,
    totalRetentions,
    netPayment,
    balance,
    isBalanced: balance < 0.01, // tolerancia de 1 centavo
  };
}
