import { hasMeliPaymentsAccess } from "@/modules/mercadolibre/permissions";
import type { Organization } from "@/modules/organizations/types";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

/** Entering Cobros Meli never grants access to customer/supplier current accounts. */
export function getCollectionsSectionsAccess(
  organization: Pick<Organization, "wholesale_enabled" | "pos_enabled">,
  permissions: readonly string[]
) {
  const legacyPermission =
    permissions.includes("organization.admin") ||
    READ_PERMISSIONS.collections.some((permission) =>
      permissions.includes(permission)
    );
  return {
    currentAccounts:
      isOrganizationModuleEnabled(organization, "wholesale") &&
      legacyPermission,
    mercadoLibre:
      isOrganizationModuleEnabled(organization, "pos") &&
      hasMeliPaymentsAccess(permissions),
  };
}
