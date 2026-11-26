"use server";

import {
  AccountingServiceError,
  changeMeliPostingPeriodServer,
} from "@/lib/accounting-server";
import { requireAuth } from "@/lib/supabase/auth";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { meliPeriodAttemptSchema } from "../utils/accounting-period-attempt";

export async function changeMeliPostingPeriodAction(
  orgSlug: string,
  rawInput: unknown
) {
  const { expectedActorId, ...input } = meliPeriodAttemptSchema.parse(rawInput);
  await ensure("accounting.manage", orgSlug);
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
  const auth = await requireAuth();
  const org = await getOrganizationBySlug(orgSlug);
  if (!(auth && org)) {
    throw new Error("Usuario u organización no autorizados.");
  }
  if (auth.userId.toLowerCase() !== expectedActorId.toLowerCase()) {
    throw new Error(
      "La solicitud pertenece a otro usuario. Iniciá sesión con el usuario original para recuperarla."
    );
  }
  try {
    const data = await changeMeliPostingPeriodServer({
      ...input,
      orgId: org.id,
      actorId: auth.userId,
    });
    return { success: true as const, data };
  } catch (error) {
    if (error instanceof AccountingServiceError && error.status === 409) {
      return { success: false as const, error: error.message };
    }
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new Error(
      `${detail}. Consultá el estado y reintentá con la misma solicitud.`,
      { cause: error }
    );
  }
}
