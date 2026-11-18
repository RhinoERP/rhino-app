import Link from "next/link";
import { MeliSaleForm } from "@/components/mercadolibre/meli-sale-form";
import { getMeliSetup } from "@/modules/mercadolibre/service/meli-read.service";

export default async function NewMeliSalePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const setup = await getMeliSetup(orgSlug);
  const ready = setup.warehouse !== null && setup.invoiceTypes.length > 0;
  const configurationMessage = setup.warehouse
    ? "Un administrador debe configurar la condición IVA del emisor en ARCA antes de registrar ventas Meli."
    : "No hay un depósito Meli activo y asignado a tu usuario. Un administrador debe configurarlo desde Venta Directa.";
  return (
    <div className="space-y-5">
      <Link
        className="text-sm hover:underline"
        href={`/org/${orgSlug}/venta-directa/mercado-libre`}
      >
        ← Ventas Mercado Libre
      </Link>
      <h1 className="font-heading text-2xl">Nueva venta Mercado Libre</h1>
      {ready ? (
        <MeliSaleForm
          key={`${orgSlug}:${setup.warehouse?.id}:${setup.invoiceTypes.join(",")}`}
          orgSlug={orgSlug}
          setup={setup}
        />
      ) : (
        <p>{configurationMessage}</p>
      )}
    </div>
  );
}
