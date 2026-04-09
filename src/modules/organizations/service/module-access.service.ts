import { redirect } from "next/navigation";
import {
  isOrganizationModuleEnabled,
  type OrganizationModule,
} from "@/modules/organizations/utils/module-flags";
import { getOrganizationBySlug } from "./organizations.service";

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
