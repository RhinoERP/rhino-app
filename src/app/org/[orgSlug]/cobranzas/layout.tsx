import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type CollectionsModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CollectionsModuleLayout({
  children,
  params,
}: CollectionsModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "wholesale");

  return children;
}
