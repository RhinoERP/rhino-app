import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type PosTerminalsModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PosTerminalsModuleLayout({
  children,
  params,
}: PosTerminalsModuleLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "pos");

  return children;
}
