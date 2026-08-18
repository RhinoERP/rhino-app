"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { confirmIncompleteSaleWithStockDeduction } from "@/modules/sales/service/sales.service";

/** The only operational transition that turns a Preventa into a stock-moving Venta. */
export async function convertPreventaToSaleAction(input: {
  orgSlug: string;
  preventaId: string;
}) {
  await ensure("orders.manage", input.orgSlug);
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data: preventa, error } = await supabase
    .from("sales_orders")
    .select("*")
    .eq("id", input.preventaId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error || !preventa) {
    throw new Error("Preventa no encontrada");
  }
  const preventaRecord = preventa as unknown as {
    id: string;
    document_type: string;
    preventa_status: string | null;
  };
  if (preventaRecord.document_type !== "STANDARD") {
    throw new Error("Sólo una preventa operativa puede convertirse en venta");
  }
  if (preventaRecord.preventa_status !== "LISTA_PARA_CONVERTIR") {
    throw new Error("La preventa todavía no está lista para convertir");
  }

  await confirmIncompleteSaleWithStockDeduction(
    supabase,
    org.id,
    preventaRecord.id
  );
  revalidatePath(`/org/${input.orgSlug}/ventas/${preventaRecord.id}`);
  revalidatePath(`/org/${input.orgSlug}/pedidos`);
  return { success: true, saleId: preventaRecord.id };
}
