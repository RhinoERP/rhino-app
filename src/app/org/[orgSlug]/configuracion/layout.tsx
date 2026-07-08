import { notFound } from "next/navigation";
import { ConfigurationNav } from "@/components/layout/configuration-nav";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ConfiguracionLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ConfiguracionLayout({
  children,
  params,
}: ConfiguracionLayoutProps) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    notFound();
  }

  await guardOrganizationPermissionAccess(orgSlug, "organization.admin");

  const accountingEnabled = organization.accounting_enabled === true;

  return (
    <div className="flex flex-1 gap-6">
      <aside className="w-56 shrink-0">
        <ConfigurationNav
          accountingEnabled={accountingEnabled}
          orgSlug={orgSlug}
          posEnabled={organization.pos_enabled ?? true}
        />
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
