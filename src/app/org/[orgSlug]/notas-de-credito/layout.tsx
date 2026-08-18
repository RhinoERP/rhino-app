import type { ReactNode } from "react";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

type CreditNotesLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function CreditNotesLayout({
  children,
  params,
}: CreditNotesLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(
    orgSlug,
    READ_PERMISSIONS.creditnotes
  );

  return children;
}
