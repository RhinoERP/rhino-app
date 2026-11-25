import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  listSavedOrderRemittances,
  savedRemittanceData,
} from "@/modules/orders/server/order-remittance-documents.service";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";

/** Called only after the sale's existing permission and tenant guards. */
export async function findSaleFiscalRemittance(
  orgSlug: string,
  saleId: string,
  organizationId: string
) {
  const supabase = await createClient();
  const [order, settings] = await Promise.all([
    supabase
      .from("orders")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sales_order_id", saleId)
      .is("parent_order_id", null)
      .maybeSingle(),
    getOrganizationSettings(orgSlug),
  ]);
  if (order.error) {
    throw new Error("No se pudieron consultar los remitos del despacho.");
  }
  if (!settings.success) {
    throw new Error("No se pudo verificar la configuración de remitos.");
  }
  const documents = order.data
    ? await listSavedOrderRemittances(orgSlug, order.data.id)
    : [];
  const fiscal = documents.filter(
    (document) =>
      document.status === "ISSUED" &&
      savedRemittanceData(document).remittance.fiscal
  );
  if (fiscal.length === 1) {
    return savedRemittanceData(fiscal[0]).remittance;
  }
  if (fiscal.length > 1) {
    throw new Error(
      "La venta tiene varios remitos fiscales. Descargalos desde los documentos de cada despacho."
    );
  }
  if (settings.data?.remittance_fiscal_enabled) {
    throw new Error(
      "Emití el remito con CAI desde Preparar remitos y despachar. Después podrás descargarlo acá."
    );
  }
  return null;
}
