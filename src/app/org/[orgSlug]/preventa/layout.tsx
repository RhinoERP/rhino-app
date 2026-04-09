import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type PreSalesModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSalesModuleLayout({
  children,
  params,
}: PreSalesModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "wholesale");

  return children;
}
