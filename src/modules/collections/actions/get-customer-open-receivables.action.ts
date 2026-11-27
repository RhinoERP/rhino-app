"use server";

import { getReceivablesByOrgSlug } from "@/modules/collections/service/collections.service";
import { ensureCollectionsRead } from "@/modules/collections/utils/permissions";

export type CustomerOpenReceivable = {
  id: string;
  invoiceNumber: string | null;
  saleNumber: number | null;
  saleDate: string | null;
  dueDate: string;
  currency: string;
  totalAmount: number;
  pendingBalance: number;
};

/** Use the same own/all collections scope as the existing receivables screen. */
export async function getCustomerOpenReceivablesAction(
  orgSlug: string,
  customerId: string
): Promise<CustomerOpenReceivable[]> {
  await ensureCollectionsRead(orgSlug);
  const accounts = await getReceivablesByOrgSlug(orgSlug);
  return accounts
    .filter(
      (account) =>
        account.customer_id === customerId && account.pending_balance > 0
    )
    .map((account) => ({
      id: account.id,
      invoiceNumber: account.sale?.invoice_number ?? null,
      saleNumber: account.sale?.sale_number ?? null,
      saleDate: account.sale?.sale_date ?? null,
      dueDate: account.due_date,
      currency: account.currency ?? "ARS",
      totalAmount: account.total_amount,
      pendingBalance: account.pending_balance,
    }));
}
