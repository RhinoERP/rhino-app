import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type PosModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PosModuleLayout({
  children,
  params,
}: PosModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "pos");

  return children;
}
