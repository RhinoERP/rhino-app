import type { createClient } from "@/lib/supabase/server";

/** Read by organization id so operational services share the same tenant policy. */
export async function isInvoiceBackedDebtEnabled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener la política de deuda: ${error.message}`
    );
  }

  const settings = data?.settings;
  return (
    settings !== null &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    settings?.invoice_backed_debt_enabled === true
  );
}

/** Notes of sale keep operational debt, including their informal advances. */
export async function requiresFiscalInvoiceForSaleDebt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  saleId: string
): Promise<boolean> {
  if (!(await isInvoiceBackedDebtEnabled(supabase, organizationId))) {
    return false;
  }

  const { data, error } = await supabase
    .from("sales_orders")
    .select("invoice_type")
    .eq("organization_id", organizationId)
    .eq("id", saleId)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo verificar el comprobante de la venta: ${error?.message ?? "Venta no encontrada"}`
    );
  }

  return data.invoice_type !== "NOTA_DE_VENTA";
}
