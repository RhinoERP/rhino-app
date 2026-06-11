import Link from "next/link";
import { notFound } from "next/navigation";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { Button } from "@/components/ui/button";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getQuotesAction } from "@/modules/quotes/actions/get-quotes.action";

type QuotesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function QuotesListPage({ params }: QuotesPageProps) {
  const { orgSlug } = await params;

  // Verificamos que la organización exista
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    notFound();
  }

  // Obtenemos todos los presupuestos de la organización
  const quotes = await getQuotesAction(orgSlug);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      {/* Encabezado con título y botón de acción rápida */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-bold text-3xl tracking-tight">
            Listado de Presupuestos
          </h2>
          <p className="text-muted-foreground text-sm">
            Gestiona y consulta todos los presupuestos generados.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/presupuestos/nuevo`}>
            + Nuevo Presupuesto
          </Link>
        </Button>
      </div>

      {/* Estado vacío: no hay presupuestos creados */}
      {quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            No se encontraron presupuestos.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href={`/org/${orgSlug}/presupuestos/nuevo`}>
              Crear el primero
            </Link>
          </Button>
        </div>
      ) : (
        // Tabla con el listado de presupuestos (TanStack Table con buscador, ordenado y paginado)
        <QuotesTable orgSlug={orgSlug} quotes={quotes} />
      )}
    </div>
  );
}
