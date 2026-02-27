import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

const DELETABLE_PRE_SALE_STATUSES = new Set(["DRAFT", "CANCELLED", "PENDING"]);

export async function deletePreSale(orgSlug: string, id: string) {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: preSale, error: preSaleError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (preSaleError) {
    throw new Error(`No se pudo validar la preventa: ${preSaleError.message}`);
  }

  if (!preSale?.id) {
    throw new Error("Preventa no encontrada");
  }

  if (!DELETABLE_PRE_SALE_STATUSES.has(String(preSale.status))) {
    throw new Error(
      "Solo se pueden eliminar preventas en estado borrador o canceladas"
    );
  }

  const { data: receivables, error: receivablesError } = await supabase
    .from("accounts_receivable")
    .select("id")
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (receivablesError) {
    throw new Error(
      `No se pudieron obtener las cuentas por cobrar asociadas: ${receivablesError.message}`
    );
  }

  const receivableIds = (receivables ?? [])
    .map((receivable) => receivable.id)
    .filter((receivableId): receivableId is string => Boolean(receivableId));

  if (receivableIds.length > 0) {
    const { error: deleteReceivablePaymentsError } = await supabase
      .from("receivable_payments")
      .delete()
      .eq("organization_id", org.id)
      .in("account_receivable_id", receivableIds);

    if (deleteReceivablePaymentsError) {
      throw new Error(
        `No se pudieron eliminar los pagos asociados a la cuenta por cobrar: ${deleteReceivablePaymentsError.message}`
      );
    }
  }

  const { error: deleteReceivableError } = await supabase
    .from("accounts_receivable")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteReceivableError) {
    throw new Error(
      `No se pudo eliminar la cuenta por cobrar asociada: ${deleteReceivableError.message}`
    );
  }

  const { error: deleteTaxesError } = await supabase
    .from("sales_order_taxes")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteTaxesError) {
    throw new Error(
      `No se pudieron eliminar los impuestos de la preventa: ${deleteTaxesError.message}`
    );
  }

  const { error: deleteItemsError } = await supabase
    .from("sales_order_items")
    .delete()
    .eq("sales_order_id", id)
    .eq("organization_id", org.id);

  if (deleteItemsError) {
    throw new Error(
      `No se pudieron eliminar los ítems de la preventa: ${deleteItemsError.message}`
    );
  }

  const { error: deletePreSaleError } = await supabase
    .from("sales_orders")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id);

  if (deletePreSaleError) {
    throw new Error(
      `No se pudo eliminar la preventa: ${deletePreSaleError.message}`
    );
  }
}
