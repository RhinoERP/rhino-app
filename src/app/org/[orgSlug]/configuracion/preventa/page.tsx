import { PreSaleSettings } from "@/components/configuration/pre-sale-settings";

type PreSaleConfigPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSaleConfigPage({
  params,
}: PreSaleConfigPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Preventa</h1>
        <p className="text-muted-foreground text-sm">
          Configura los valores predeterminados para nuevas preventas.
        </p>
      </div>
      <PreSaleSettings orgSlug={orgSlug} />
    </div>
  );
}
