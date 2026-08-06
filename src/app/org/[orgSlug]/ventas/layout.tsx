import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type SalesModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SalesModuleLayout({
  children,
  params,
}: SalesModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "wholesale");
  await guardOrganizationPermissionAccess(orgSlug, [
    "sales.read",
    "sales.read.all",
    "sales.manage",
    "sales.manage.all",
  ]);

  return children;
}
