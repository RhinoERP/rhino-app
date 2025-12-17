import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SUMMARY_CARD_KEYS = ["summary-card-1", "summary-card-2"];
const SIX_COLUMN_KEYS = ["col-1", "col-2", "col-3", "col-4", "col-5", "col-6"];
const MAIN_ROW_KEYS = ["row-1", "row-2", "row-3", "row-4", "row-5"];
const FIVE_COLUMN_KEYS = ["col-1", "col-2", "col-3", "col-4", "col-5"];
const SECONDARY_ROW_KEYS = ["row-1", "row-2", "row-3", "row-4"];
const FIRST_LIST_KEYS = ["item-1", "item-2", "item-3", "item-4"];
const SECOND_LIST_KEYS = ["item-1", "item-2", "item-3", "item-4", "item-5"];
const STATUS_KEYS = ["status-1", "status-2"];

export default function ProductDetailsPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-5 w-72" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SUMMARY_CARD_KEYS.map((cardKey) => (
              <Card key={cardKey}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-32" />
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              <div className="grid grid-cols-6 gap-3 px-4 py-3">
                {SIX_COLUMN_KEYS.map((columnKey) => (
                  <Skeleton className="h-4 w-full" key={columnKey} />
                ))}
              </div>
              {MAIN_ROW_KEYS.map((rowKey) => (
                <div className="grid grid-cols-6 gap-3 px-4 py-3" key={rowKey}>
                  {SIX_COLUMN_KEYS.map((columnKey) => (
                    <Skeleton
                      className="h-4 w-full"
                      key={`${rowKey}-${columnKey}`}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              <div className="grid grid-cols-5 gap-3 px-4 py-3">
                {FIVE_COLUMN_KEYS.map((columnKey) => (
                  <Skeleton className="h-4 w-full" key={columnKey} />
                ))}
              </div>
              {SECONDARY_ROW_KEYS.map((rowKey) => (
                <div className="grid grid-cols-5 gap-3 px-4 py-3" key={rowKey}>
                  {FIVE_COLUMN_KEYS.map((columnKey) => (
                    <Skeleton
                      className="h-4 w-full"
                      key={`${rowKey}-${columnKey}`}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-full space-y-3 lg:max-w-xs xl:max-w-sm">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-9 w-20" />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-3 w-36" />
                {FIRST_LIST_KEYS.map((itemKey) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={itemKey}
                  >
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <Skeleton className="h-3 w-32" />
                {SECOND_LIST_KEYS.map((itemKey) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={itemKey}
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {STATUS_KEYS.map((statusKey) => (
                  <div className="flex items-center gap-2" key={statusKey}>
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-48" />
          </div>
        </div>
      </div>
    </div>
  );
}
