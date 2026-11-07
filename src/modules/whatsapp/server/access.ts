import type { NextRequest } from "next/server";
import {
  getWhatsAppUserAccess,
  WhatsAppControlAccessError,
} from "./conversation-control";
import { createWhatsAppAdminClient } from "./supabase-admin";

export async function getWhatsAppSandboxAccess(
  orgSlug: string,
  request: NextRequest,
  required: string | string[]
) {
  const access = await getWhatsAppUserAccess(orgSlug, required, request);
  if (access.organization.whatsapp_sandbox_enabled !== true) {
    throw new WhatsAppControlAccessError(
      "El simulador de WhatsApp está deshabilitado"
    );
  }
  return access;
}

/** Service-role entry points must enforce the tenant flag explicitly. */
export async function assertWhatsAppEnabled(
  organizationId: string,
  mode: "whatsapp" | "whatsapp_sandbox" = "whatsapp"
): Promise<void> {
  const { data, error } = await createWhatsAppAdminClient()
    .from("organizations")
    .select("is_active, whatsapp_enabled, whatsapp_sandbox_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  const enabled =
    mode === "whatsapp_sandbox"
      ? data?.whatsapp_sandbox_enabled === true
      : data?.whatsapp_enabled === true;
  if (error || !data?.is_active || !enabled) {
    throw new Error(
      "El módulo de WhatsApp no está habilitado para esta organización"
    );
  }
}
