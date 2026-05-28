import { truncateMoney } from "@/lib/decimal";

export type AdvanceStatus = "pending" | "collected" | "credited";

export type ReceiptItemType =
  | "check_third"
  | "transfer"
  | "retention_iibb"
  | "retention_gcias"
  | "cash";

export const RECEIPT_ITEM_LABELS: Record<ReceiptItemType, string> = {
  check_third: "Cheque de tercero",
  transfer: "Transferencia",
  retention_iibb: "Retención IIBB sufrida",
  retention_gcias: "Retención Ganancias sufrida",
  cash: "Efectivo",
};

export const RETENTION_RECEIPT_ITEMS: ReceiptItemType[] = [
  "retention_iibb",
  "retention_gcias",
];

export type ReceiptItemLine = {
  id: string;
  item_type: ReceiptItemType;
  amount: number; // positivo = cobro, negativo ya lo maneja el cálculo
  reference?: string;
  bank_name?: string;
  due_date?: string;
};

export type SaleAdvance = {
  id: string;
  description: string;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  status: AdvanceStatus;
  advance_number: number;
  issued_at: string;
  sale_id?: string | null;
  quote_id?: string | null;
  credit_note_id?: string | null;
};

export type CreateAdvanceInput = {
  orgSlug: string;
  description: string;
  net_amount: number;
  tax_rate?: number; // default 21%
  sale_id?: string;
  quote_id?: string;
};

export type CreateReceiptInput = {
  orgSlug: string;
  advance_id: string;
  items: Omit<ReceiptItemLine, "id">[];
  notes?: string;
};

export type ReceiptSummary = {
  totalCollected: number;
  totalRetentions: number;
  netReceipt: number;
  advanceTotal: number;
  balance: number;
  isBalanced: boolean;
};

export function calculateReceiptSummary(
  advanceTotal: number,
  items: ReceiptItemLine[]
): ReceiptSummary {
  const totalCollected = truncateMoney(
    items
      .filter((i) => !RETENTION_RECEIPT_ITEMS.includes(i.item_type))
      .reduce((s, i) => s + i.amount, 0)
  );
  const totalRetentions = truncateMoney(
    items
      .filter((i) => RETENTION_RECEIPT_ITEMS.includes(i.item_type))
      .reduce((s, i) => s + i.amount, 0)
  );
  const netReceipt = truncateMoney(totalCollected - totalRetentions);
  const balance = truncateMoney(advanceTotal - netReceipt);

  return {
    totalCollected,
    totalRetentions,
    netReceipt,
    advanceTotal,
    balance,
    isBalanced: balance < 0.01,
  };
}
