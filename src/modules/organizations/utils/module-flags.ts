import type { Organization } from "@/modules/organizations/types";

export type OrganizationModule = "wholesale" | "pos" | "production";

type OrganizationModuleFlags = Partial<
  Pick<Organization, "wholesale_enabled" | "pos_enabled" | "production_enabled">
>;

export function isOrganizationModuleEnabled(
  organization: OrganizationModuleFlags | null | undefined,
  module: OrganizationModule
): boolean {
  if (!organization) {
    return true;
  }

  if (module === "wholesale") {
    return organization.wholesale_enabled !== false;
  }

  if (module === "pos") {
    return organization.pos_enabled !== false;
  }

  return organization.production_enabled === true;
}
