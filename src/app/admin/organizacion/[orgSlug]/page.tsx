import { notFound } from "next/navigation";
import { OrganizationDetailsClient } from "@/components/admin/organization-details-client";
import { getOrganizationMembersAdminView } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getOrganizationRolesBySlug } from "@/modules/organizations/service/roles.service";

type OrganizationDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationDetailsPage({
  params,
}: OrganizationDetailsPageProps) {
  const { orgSlug } = await params;

  const [organization, members, roles] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getOrganizationMembersAdminView(orgSlug),
    getOrganizationRolesBySlug(orgSlug),
  ]);

  if (!organization) {
    notFound();
  }

  return (
    <OrganizationDetailsClient
      members={members}
      organization={organization}
      roles={roles}
    />
  );
}
