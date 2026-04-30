import { ConfigurablePriceListsSettings } from "@/components/configuration/configurable-price-lists-settings";
import { DueDaysSettings } from "@/components/configuration/due-days-settings";

type CondicionesDeVentaPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CondicionesDeVentaPage({
  params,
}: CondicionesDeVentaPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Condiciones de Venta</h1>
        <p className="text-muted-foreground text-sm">
          Configurá los plazos y condiciones que se aplican a las ventas por
          defecto.
        </p>
      </div>

      <DueDaysSettings orgSlug={orgSlug} />
      <ConfigurablePriceListsSettings orgSlug={orgSlug} />
    </div>
  );
}
