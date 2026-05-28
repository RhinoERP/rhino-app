"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

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

export async function getPendingInvoicesBySupplier(
  orgSlug: string
): Promise<SupplierForPayment[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_payable")
    .select(
      `
      id,
      purchase_order_id,
      pending_balance,
      total_amount,
      due_date,
      supplier_id,
      suppliers!accounts_payable_supplier_fkey (
        id,
        name
      ),
      purchase_orders!accounts_payable_po_fkey (
        purchase_number
      )
    `
    )
    .eq("organization_id", org.id)
    .gt("pending_balance", 0)
    .in("status", ["PENDING", "PARTIAL"])
    .order("due_date", { ascending: true });

  if (error || !data) {
    return [];
  }

  // Agrupar por proveedor
  const supplierMap = new Map<string, SupplierForPayment>();

  for (const row of data) {
    const supplier = row.suppliers as { id: string; name: string } | null;
    const po = row.purchase_orders as { purchase_number: number | null } | null;
    if (!supplier) {
      continue;
    }

    if (!supplierMap.has(supplier.id)) {
      supplierMap.set(supplier.id, {
        id: supplier.id,
        name: supplier.name,
        pendingInvoices: [],
        totalPending: 0,
      });
    }

    // biome-ignore lint/style/noNonNullAssertion: se garantiza que la clave existe porque se insertó en el bloque anterior
    const entry = supplierMap.get(supplier.id)!;
    entry.pendingInvoices.push({
      purchase_order_id: row.purchase_order_id,
      purchase_number: po?.purchase_number ?? null,
      total_amount: row.total_amount,
      pending_balance: row.pending_balance,
      due_date: row.due_date,
    });
    entry.totalPending += row.pending_balance;
  }

  return Array.from(supplierMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
