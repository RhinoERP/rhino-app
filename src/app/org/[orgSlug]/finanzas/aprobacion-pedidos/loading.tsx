import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceApprovalPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-1 h-4 w-80" />
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
