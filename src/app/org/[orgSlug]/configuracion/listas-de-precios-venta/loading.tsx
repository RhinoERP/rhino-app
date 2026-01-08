import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function SalesPriceListsPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Listas de precios de venta</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona las listas de precios que se aplican a los clientes. El
            porcentaje se aplica a todos los productos.
          </p>
        </div>
        <Skeleton className="h-10 w-48" />
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
