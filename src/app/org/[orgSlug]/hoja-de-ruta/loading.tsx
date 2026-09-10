import { Skeleton } from "@/components/ui/skeleton";

export default function RouteSheetPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => `route-sheet-${index}`).map(
          (key) => (
            <Skeleton className="h-24 w-full" key={key} />
          )
        )}
      </div>
    </div>
  );
}
