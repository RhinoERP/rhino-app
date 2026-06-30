import { AccountingIntegrationSettings } from "@/components/configuration/accounting-integration-settings";

type AccountingSettingsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AccountingSettingsPage({
  params,
}: AccountingSettingsPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Contabilidad</h1>
        <p className="text-muted-foreground text-sm">
          Configurá si esta organización integra sus flujos operativos con el
          módulo contable.
        </p>
      </div>

      <AccountingIntegrationSettings orgSlug={orgSlug} />
    </div>
  );
}
