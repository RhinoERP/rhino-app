import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { unstable_noStore as noStore } from "next/cache";
import { AddTaxDialog } from "@/components/taxes/add-tax-dialog";
import { ImportCatalogDialog } from "@/components/taxes/import-catalog-dialog";
import { TaxModuleAssignments } from "@/components/taxes/tax-module-assignments";
import { TaxesHelpSection } from "@/components/taxes/taxes-help-section";
import { getQueryClient } from "@/lib/get-query-client";
import { ARGENTINA_TAX_CATALOG } from "@/modules/taxes/argentina-catalog";
import { taxesServerQueryOptions } from "@/modules/taxes/queries/queries.server";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";
import { TaxesDataTable } from "./data-table";

type TaxesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TaxesPage({ params }: TaxesPageProps) {
  noStore();
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const [taxes] = await Promise.all([
    getActiveTaxesByOrgSlug(orgSlug),
    queryClient.prefetchQuery(taxesServerQueryOptions(orgSlug)),
  ]);

  // Catalog keys already imported by this org
  const importedKeys = new Set(
    taxes
      .map((t) => (t as { catalog_key?: string | null }).catalog_key)
      .filter((k): k is string => Boolean(k))
  );

  const totalCatalogTaxes = ARGENTINA_TAX_CATALOG.length;
  const importedCount = importedKeys.size;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Impuestos</h1>
          <p className="text-muted-foreground text-sm">
            Gestioná los impuestos de tu organización y asignalos a cada módulo.
          </p>
        </div>
        <div className="flex gap-2">
          <ImportCatalogDialog importedKeys={importedKeys} orgSlug={orgSlug} />
          <AddTaxDialog orgSlug={orgSlug} />
        </div>
      </div>

      {/* Catalog import status */}
      {importedCount < totalCatalogTaxes && importedCount === 0 && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="font-medium text-blue-700 text-sm dark:text-blue-400">
            💡 Catálogo argentino disponible
          </p>
          <p className="mt-0.5 text-blue-600/80 text-xs dark:text-blue-400/80">
            Importá los impuestos preconfigurados (IVA, IIBB por provincia,
            percepciones, retenciones, sellos) con un click. Podés filtrar por
            provincia y elegir solo los que aplican.
          </p>
        </div>
      )}

      {importedCount > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="inline-flex size-2 rounded-full bg-emerald-500" />
          {importedCount} impuesto{importedCount !== 1 ? "s" : ""} del catálogo
          importado{importedCount !== 1 ? "s" : ""} ·{" "}
          <span className="text-xs">
            {totalCatalogTaxes - importedCount} disponible
            {totalCatalogTaxes - importedCount !== 1 ? "s" : ""} para importar
          </span>
        </div>
      )}

      {/* Taxes table */}
      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaxesDataTable orgSlug={orgSlug} />
      </HydrationBoundary>

      {/* Module assignments */}
      <div className="border-t pt-6">
        <TaxModuleAssignments orgSlug={orgSlug} taxes={taxes} />
      </div>

      {/* Help guide */}
      <div className="border-t pt-6">
        <TaxesHelpSection />
      </div>
    </div>
  );
}
