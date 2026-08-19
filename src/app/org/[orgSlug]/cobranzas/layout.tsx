import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

type CollectionsModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CollectionsModuleLayout({
  children,
  params,
}: CollectionsModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "wholesale");
  await guardOrganizationPermissionAccess(
    orgSlug,
    READ_PERMISSIONS.collections
  );

  return children;
}
