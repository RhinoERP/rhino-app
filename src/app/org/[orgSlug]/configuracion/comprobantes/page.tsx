import { DispatchSettings } from "@/components/configuration/dispatch-settings";
import { RemittanceSettings } from "@/components/configuration/remittance-settings";

type ComprobantesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ComprobantesPage({
  params,
}: ComprobantesPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Comprobantes</h1>
        <p className="text-muted-foreground text-sm">
          Configurá la numeración y formato de los documentos de venta.
        </p>
      </div>

      <RemittanceSettings orgSlug={orgSlug} />

      <DispatchSettings orgSlug={orgSlug} />
    </div>
  );
}
