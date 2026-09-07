import { DistributorCatalogSettings } from "@/components/configuration/distributor-catalog-settings";

type CatalogoDistribuidorPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CatalogoDistribuidorPage({
  params,
}: CatalogoDistribuidorPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Catálogo Distribuidor</h1>
        <p className="text-muted-foreground text-sm">
          Configurá el margen que se aplica al precio que ven los distribuidores
          en el catálogo.
        </p>
      </div>

      <DistributorCatalogSettings orgSlug={orgSlug} />
    </div>
  );
}
