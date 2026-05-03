import { notFound, redirect } from "next/navigation";
import { ArcaSettingsForm } from "@/components/arca/arca-settings-form";
import { ArcaAuthorizationError } from "@/modules/arca/errors";
import { getArcaSettingsSummary } from "@/modules/arca/server/settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export const maxDuration = 300;

type ArcaConfigurationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ArcaConfigurationPage({
  params,
}: ArcaConfigurationPageProps) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    notFound();
  }

  try {
    const summary = await getArcaSettingsSummary(orgSlug);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl">Integración ARCA</h1>
          <p className="text-muted-foreground text-sm">
            Configurá la delegación multitenant o el fallback manual, el punto
            de venta y la conectividad fiscal de {organization.name}.
          </p>
        </div>

        <ArcaSettingsForm initialSummary={summary} orgSlug={orgSlug} />
      </div>
    );
  } catch (error) {
    if (error instanceof ArcaAuthorizationError) {
      redirect(`/org/${orgSlug}`);
    }

    throw error;
  }
}
