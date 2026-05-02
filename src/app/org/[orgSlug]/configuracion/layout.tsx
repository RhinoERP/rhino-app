import { notFound } from "next/navigation";
import { ConfigurationNav } from "@/components/layout/configuration-nav";
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

  return (
    <div className="flex flex-1 gap-6">
      <aside className="w-56 shrink-0">
        <ConfigurationNav
          orgSlug={orgSlug}
          posEnabled={organization.pos_enabled ?? true}
        />
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
