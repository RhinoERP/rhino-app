"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getPendingInvoicesBySupplier } from "../service/payment-orders.service";

export type PendingInvoice = {
  purchase_order_id: string;
  purchase_number: number | null;
  total_amount: number;
  pending_balance: number;
  due_date: string;
};

export type SupplierForPayment = {
  id: string;
  name: string;
  pendingInvoices: PendingInvoice[];
  totalPending: number;
};

export async function getPendingInvoicesBySupplierAction(
  orgSlug: string
): Promise<SupplierForPayment[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  return await getPendingInvoicesBySupplier(orgSlug);
}
