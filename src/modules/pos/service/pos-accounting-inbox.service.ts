import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EventoVentaPos } from "@/modules/accounting/types";
import type { PosSaleAccountingInboxItem } from "../types";
import {
  isPosSaleAccountingActionable,
  POS_ACCOUNTING_INBOX_STATUSES,
  type PosAccountingInboxStatus,
} from "../utils/accounting-inbox";

const INBOX_LIMIT = 200;

type PosSaleInboxRow = {
  id: string;
  sale_date: string;
  receipt_number: string | null;
  invoice_type: string | null;
  invoice_number: string | null;
  total_amount: number | null;
  arca_status: string | null;
  accounting_status: string;
  accounting_last_error: string | null;
  accounting_updated_at: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
  payments: { payment_method: string | null }[] | null;
};

export async function listPosSalesAccountingInbox(params: {
  orgId: string;
  status?: PosAccountingInboxStatus;
}): Promise<PosSaleAccountingInboxItem[]> {
  const supabase = await createClient();
  const statuses = params.status
    ? [params.status]
    : [...POS_ACCOUNTING_INBOX_STATUSES];

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      "id, sale_date, receipt_number, invoice_type, invoice_number, total_amount, arca_status, accounting_status, accounting_last_error, accounting_updated_at, accounting_sale_event_snapshot, payments:pos_payments(payment_method)" as never
    )
    .eq("organization_id", params.orgId)
    .in("accounting_status" as never, statuses as never)
    .order("sale_date", { ascending: false })
    .limit(INBOX_LIMIT);

  if (error) {
    throw new Error(
      `No se pudieron obtener las ventas POS pendientes: ${error.message}`
    );
  }

  return ((data ?? []) as unknown as PosSaleInboxRow[])
    .filter((row) => isPosSaleAccountingActionable(row.accounting_status))
    .map((row) => ({
      id: row.id,
      saleDate: row.sale_date,
      receiptNumber: row.receipt_number,
      invoiceType: row.invoice_type,
      invoiceNumber: row.invoice_number,
      totalAmount: Number(row.total_amount ?? 0),
      paymentMethod: row.payments?.[0]?.payment_method ?? null,
      arcaStatus: row.arca_status,
      accountingStatus: row.accounting_status as PosAccountingInboxStatus,
      accountingLastError: row.accounting_last_error,
      accountingUpdatedAt: row.accounting_updated_at,
      eventSnapshot: row.accounting_sale_event_snapshot,
    }));
}
