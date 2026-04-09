import type { Organization } from "@/modules/organizations/types";

export type OrganizationModule = "wholesale" | "pos";

type OrganizationModuleFlags = Pick<
  Organization,
  "wholesale_enabled" | "pos_enabled"
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

  return organization.pos_enabled !== false;
}
