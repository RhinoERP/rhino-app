import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export default function CustomersPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Clientes</h1>
        <p className="text-muted-foreground text-sm">
          Consulta todos los clientes de la organización.
        </p>
      </div>
      <DataTableSkeleton
        columnCount={5}
        filterCount={1}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
