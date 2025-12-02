import { ConfigurationNav } from "@/components/layout/configuration-nav";

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

  return (
    <div className="flex flex-1 gap-6">
      <aside className="w-56 shrink-0">
        <ConfigurationNav orgSlug={orgSlug} />
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
