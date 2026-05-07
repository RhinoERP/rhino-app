import { redirect } from "next/navigation";
import {
  isOrganizationModuleEnabled,
  type OrganizationModule,
} from "@/modules/organizations/utils/module-flags";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "./organizations.service";

export async function guardOrganizationModuleAccess(
  orgSlug: string,
  module: OrganizationModule
): Promise<void> {
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    redirect("/");
  }

  if (!isOrganizationModuleEnabled(organization, module)) {
    redirect(`/org/${orgSlug}`);
  }
}

export async function guardOrganizationPermissionAccess(
  orgSlug: string,
  requiredPermission: string | string[]
): Promise<void> {
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const requiredPermissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  const hasAccess = requiredPermissions.some((permission) =>
    layoutData.permissions.includes(permission)
  );

  if (!hasAccess) {
    redirect(`/org/${orgSlug}`);
  }
}
