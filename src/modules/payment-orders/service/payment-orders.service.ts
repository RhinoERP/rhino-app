import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SupplierForPayment } from "../actions/get-pending-invoices.action";
import {
  type CreatePaymentOrderInput,
  calculatePaymentSummary,
  type PaymentMethodLine,
} from "../types";

export async function createPaymentOrder(
  input: CreatePaymentOrderInput
): Promise<{ paymentOrderId: string }> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const methodLines: PaymentMethodLine[] = input.methods.map((m) => ({
    ...m,
    id: "",
  }));
  const summary = calculatePaymentSummary(input.invoices, methodLines);

  if (!summary.isBalanced) {
    throw new Error(
      `La diferencia a cancelar debe ser $0. Diferencia actual: $${summary.balance.toFixed(2)}`
    );
  }

  if (input.invoices.length === 0) {
    throw new Error("Debe seleccionar al menos una factura a cancelar");
  }

  if (input.methods.length === 0) {
    throw new Error("Debe agregar al menos un método de pago");
  }

  const supabase = await createClient();

  const { data: paymentOrder, error: poError } = await supabase
    .from("payment_orders" as never)
    .insert({
      organization_id: org.id,
      supplier_id: input.supplier_id,
      payment_date: input.payment_date,
      total_amount: summary.totalInvoices,
      notes: input.notes ?? null,
      status: "confirmed",
    })
    .select("id")
    .single();

  if (poError || !paymentOrder) {
    throw new Error(poError?.message ?? "Error al crear la orden de pago");
  }

  const paymentOrderId = (paymentOrder as { id: string }).id;

  const invoiceRows = input.invoices.map((inv) => ({
    payment_order_id: paymentOrderId,
    purchase_order_id: inv.purchase_order_id,
    amount_applied: inv.amount_applied,
  }));

  const { error: invError } = await supabase
    .from("payment_order_invoices" as never)
    .insert(invoiceRows);

  if (invError) {
    throw new Error(invError.message);
  }

  const methodRows = input.methods.map((m) => ({
    payment_order_id: paymentOrderId,
    method_type: m.method_type,
    amount: m.amount,
    reference: m.reference ?? null,
    bank_name: m.bank_name ?? null,
    due_date: m.due_date ?? null,
  }));

  const { error: methodError } = await supabase
    .from("payment_order_methods" as never)
    .insert(methodRows);

  if (methodError) {
    throw new Error(methodError.message);
  }

  return { paymentOrderId };
}

export async function getPendingInvoicesBySupplier(
  orgSlug: string
): Promise<SupplierForPayment[]> {
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
