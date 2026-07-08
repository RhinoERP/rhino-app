import { AccountingIntegrationSettings } from "@/components/configuration/accounting-integration-settings";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type AccountingSettingsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AccountingSettingsPage({
  params,
}: AccountingSettingsPageProps) {
  const { orgSlug } = await params;

  await guardOrganizationModuleAccess(orgSlug, "accounting");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Contabilidad</h1>
        <p className="text-muted-foreground text-sm">
          Configurá el comportamiento automático de los asientos contables.
        </p>
      </div>

      <AccountingIntegrationSettings orgSlug={orgSlug} />
    </div>
  );
}
