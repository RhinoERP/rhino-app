import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function StockPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">Stock</h1>
          <p className="text-muted-foreground text-sm">
            Consulta el inventario disponible de todos los productos.
          </p>
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <DataTableSkeleton
        columnCount={9}
        filterCount={1}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
