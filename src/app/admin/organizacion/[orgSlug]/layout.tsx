import { notFound } from "next/navigation";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type OrganizationAdminLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationAdminLayout({
  children,
  params,
}: OrganizationAdminLayoutProps) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    notFound();
  }

  return children;
}
