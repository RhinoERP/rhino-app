import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";

export async function isAccountingIntegrationEnabled(
  orgSlug: string
): Promise<boolean> {
  const settings = await getOrgSettings(orgSlug);
  return settings.accounting_integration_enabled;
}
