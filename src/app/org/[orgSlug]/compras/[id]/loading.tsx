import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseDetailPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div className="space-y-1">
        <Skeleton className="h-9 w-48" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="space-y-4 rounded-lg border p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border p-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,_2fr)_140px_auto] md:items-end">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
            <div className="rounded-lg border">
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-5 gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    className="grid grid-cols-5 gap-4"
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static loading skeleton, no state or interactivity
                    key={`product-row-${i}`}
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <div className="sticky top-6 space-y-4">
            <div className="space-y-4 rounded-lg border p-6">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    className="flex items-center justify-between"
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static loading skeleton, no state or interactivity
                    key={`summary-row-${i}`}
                  >
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
