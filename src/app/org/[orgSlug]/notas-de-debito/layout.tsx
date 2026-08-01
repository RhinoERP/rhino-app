import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

export default async function DebitNotesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, "debitnotes.read");
  return children;
}
