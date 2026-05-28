"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type CreatePaymentOrderInput,
  calculatePaymentSummary,
} from "../types";

type Result = { success: boolean; error?: string; paymentOrderId?: string };

export async function createPaymentOrderAction(
  input: CreatePaymentOrderInput
): Promise<Result> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    // Validación de saldo cero en el servidor (regla de negocio crítica)
    const methodLines = input.methods.map((m) => ({ ...m, id: "" }));
    const summary = calculatePaymentSummary(input.invoices, methodLines);

    if (!summary.isBalanced) {
      return {
        success: false,
        error: `La diferencia a cancelar debe ser $0. Diferencia actual: $${summary.balance.toFixed(2)}`,
      };
    }

    if (input.invoices.length === 0) {
      return {
        success: false,
        error: "Debe seleccionar al menos una factura a cancelar",
      };
    }

    if (input.methods.length === 0) {
      return {
        success: false,
        error: "Debe agregar al menos un método de pago",
      };
    }

    const supabase = await createClient();

    // 1. Crear la orden de pago
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

    // 2. Insertar facturas canceladas
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

    // 3. Insertar métodos de pago
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

    revalidatePath(`/org/${input.orgSlug}/compras`);

    return { success: true, paymentOrderId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
