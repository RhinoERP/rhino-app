import { ConfigurationMetrics } from "@/components/configuration/configuration-metrics";
import { ConfigurationQuickLinks } from "@/components/configuration/configuration-quick-links";
import { OrganizationInfo } from "@/components/configuration/organization-info";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import { getActiveInvitationsBySlug } from "@/modules/organizations/service/invitations.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getOrganizationRolesBySlug } from "@/modules/organizations/service/roles.service";

type ConfigurationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ConfigurationPage({
  params,
}: ConfigurationPageProps) {
  const { orgSlug } = await params;

  // Fetch all data in parallel
  const [organization, members, roles, categories, invitations] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getOrganizationMembersBySlug(orgSlug),
      getOrganizationRolesBySlug(orgSlug),
      getCategoriesByOrgSlug(orgSlug),
      getActiveInvitationsBySlug(orgSlug),
    ]);

  if (!organization) {
    return (
      <div>
        <h1 className="mb-6 font-heading text-2xl">
          Organización no encontrada
        </h1>
      </div>
    );
  }

  const metrics = {
    membersCount: members.length,
    rolesCount: roles.length,
    categoriesCount: categories.length,
    invitationsCount: invitations.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 font-heading text-2xl">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona la información y configuración de tu organización
        </p>
      </div>

      <OrganizationInfo organization={organization} />

      <ConfigurationMetrics metrics={metrics} orgSlug={orgSlug} />

      <div>
        <h2 className="mb-4 font-heading text-lg">Accesos Rápidos</h2>
        <ConfigurationQuickLinks
          orgSlug={orgSlug}
          posEnabled={organization.pos_enabled ?? true}
        />
      </div>
    </div>
  );
}
