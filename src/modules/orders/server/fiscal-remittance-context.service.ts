import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  authorizationAvailability,
  caiAuthorizationSchema,
} from "@/modules/arca/cai";

export async function getFiscalRemittanceContext(
  organizationId: string,
  documentCount: number
) {
  const result = await createAdminClient()
    .from("remittance_cai_authorizations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("state", "active")
    .maybeSingle();
  if (result.error) {
    throw new Error("No se pudo verificar el CAI activo.");
  }
  if (!result.data) {
    throw new Error(
      "Activá un CAI en Configuración → Comprobantes antes de despachar."
    );
  }
  const authorization = caiAuthorizationSchema.parse(result.data);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (authorizationAvailability(authorization, today) !== "available") {
    throw new Error(
      "El CAI está vencido o no tiene numeración disponible. Revisá Configuración → Comprobantes."
    );
  }
  const next = authorization.next_number ?? 1;
  if (next + documentCount - 1 > (authorization.last_number ?? 99_999_999)) {
    throw new Error(
      "La numeración autorizada no alcanza para todos los remitos del despacho."
    );
  }
  return {
    cai: authorization.cai,
    expiresAt: authorization.expires_at,
    pointOfSale: authorization.point_of_sale,
    nextNumber: next,
    mode: authorization.mode,
  };
}
