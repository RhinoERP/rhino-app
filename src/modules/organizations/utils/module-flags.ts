import type { Organization } from "@/modules/organizations/types";

export type OrganizationModule =
  | "wholesale"
  | "pos"
  | "production"
  | "accounting"
  | "commissions"
  | "route_sheets"
  | "whatsapp"
  | "whatsapp_sandbox";

type OrganizationModuleFlags = Partial<
  Pick<
    Organization,
    | "wholesale_enabled"
    | "pos_enabled"
    | "production_enabled"
    | "accounting_enabled"
    | "commissions_enabled"
    | "route_sheets_enabled"
    | "whatsapp_enabled"
    | "whatsapp_sandbox_enabled"
  >
>;

export function isOrganizationModuleEnabled(
  organization: OrganizationModuleFlags | null | undefined,
  module: OrganizationModule
): boolean {
  // New WhatsApp capabilities fail closed, including missing layout data.
  if (module === "whatsapp") {
    return organization?.whatsapp_enabled === true;
  }
  if (module === "whatsapp_sandbox") {
    return organization?.whatsapp_sandbox_enabled === true;
  }

  if (!organization) {
    return true;
  }

  if (module === "wholesale") {
    return organization.wholesale_enabled !== false;
  }

  if (module === "pos") {
    return organization.pos_enabled !== false;
  }

  if (module === "production") {
    return organization.production_enabled === true;
  }

  if (module === "commissions") {
    return organization.commissions_enabled === true;
  }

  if (module === "route_sheets") {
    return organization.route_sheets_enabled === true;
  }

  return organization.accounting_enabled === true;
}
