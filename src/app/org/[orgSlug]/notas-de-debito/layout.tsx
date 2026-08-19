import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

export default async function DebitNotesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.debitnotes);
  return children;
}
