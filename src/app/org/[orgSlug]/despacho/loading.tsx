import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DispatchPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => `metric-skeleton-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-20" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      <DataTableSkeleton
        columnCount={4}
        filterCount={0}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
