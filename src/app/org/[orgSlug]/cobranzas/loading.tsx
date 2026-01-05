import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CollectionsPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Cobranzas</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona cuentas por cobrar y por pagar con pagos parciales.
          </p>
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `collections-metric-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      <DataTableSkeleton
        columnCount={7}
        filterCount={1}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
