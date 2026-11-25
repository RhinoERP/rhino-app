import { createWhatsAppAdminClient } from "./supabase-admin";

type Configuration = {
  commercial_rules?: unknown;
  business_hours?: { timezone?: string } | null;
  handoff_message?: string | null;
};

export async function getEffectiveCommercialConfiguration(
  organizationId: string,
  integration: Configuration,
  isSimulator: boolean
) {
  if (!isSimulator) {
    return integration;
  }
  return (
    (await getOrganizationCommercialConfiguration(organizationId)) ??
    integration
  );
}

/** The simulator uses the same organization policies as the real channel. */
export async function getOrganizationCommercialConfiguration(
  organizationId: string
) {
  const { data, error } = await createWhatsAppAdminClient()
    .from("whatsapp_integrations")
    .select("commercial_rules, business_hours, handoff_message")
    .eq("organization_id", organizationId)
    .not("phone_number_id", "like", "rhinos-local-simulator:%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("No se pudo consultar la configuración comercial");
  }
  return data;
}
