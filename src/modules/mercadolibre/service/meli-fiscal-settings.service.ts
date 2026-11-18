import "server-only";
import type { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { meliInvoiceTypesForIssuer } from "../utils/invoice-types";

type Admin = ReturnType<typeof createTypedAdminClient>;

export async function loadMeliIssuerInvoiceTypes(admin: Admin, orgId: string) {
  const result = await admin
    .from("organization_arca_settings")
    .select("issuer_vat_condition")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (result.error) {
    throw new Error("No se pudo verificar la condición fiscal del emisor.");
  }
  return meliInvoiceTypesForIssuer(result.data?.issuer_vat_condition ?? null);
}

export async function assertMeliInvoiceChoice(
  admin: Admin,
  orgId: string,
  invoiceType: string,
  receiverCondition: string | null
) {
  const types = await loadMeliIssuerInvoiceTypes(admin, orgId);
  if (!types.length) {
    throw new Error(
      "Configurá la condición IVA del emisor en ARCA antes de registrar ventas Meli."
    );
  }
  const requestedType =
    invoiceType === "FACTURA_A_RETENCION" ? "FACTURA_A" : invoiceType;
  if (!types.some((type) => type === requestedType)) {
    throw new Error(
      "El comprobante seleccionado no corresponde a la condición IVA del emisor."
    );
  }
  if (
    invoiceType === "FACTURA_B" &&
    receiverCondition === "RESPONSABLE_INSCRIPTO"
  ) {
    throw new Error(
      "Un responsable inscripto requiere Factura A para este emisor."
    );
  }
}
