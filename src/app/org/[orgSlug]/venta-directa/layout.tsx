import { redirect } from "next/navigation";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

type PosModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PosModuleLayout({
  children,
  params,
}: PosModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const [organization, layoutData] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getOrganizationLayoutData(orgSlug),
  ]);
  if (
    isOrganizationModuleEnabled(organization, "production") &&
    !layoutData?.permissions.includes("mercadolibre.access")
  ) {
    redirect(`/org/${orgSlug}`);
  }
  await guardOrganizationPermissionAccess(orgSlug, [
    ...READ_PERMISSIONS.pos,
    ...READ_PERMISSIONS.mercadolibre,
  ]);

  return children;
}
