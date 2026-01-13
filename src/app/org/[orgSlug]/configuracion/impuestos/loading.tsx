import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export default function TaxesPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Impuestos</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona los impuestos disponibles para esta organización.
        </p>
      </div>
      <DataTableSkeleton
        columnCount={5}
        filterCount={0}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
