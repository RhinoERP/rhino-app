import { Skeleton } from "@/components/ui/skeleton";

export default function BocetoPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>

      <Skeleton className="h-64 w-full rounded-xl" />

      <Skeleton className="h-48 w-full rounded-xl border-2 border-dashed" />
    </div>
  );
}
