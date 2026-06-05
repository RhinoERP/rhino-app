import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FIELD_KEYS = ["f-1", "f-2", "f-3", "f-4"];
const HEADER_KEYS = ["h-1", "h-2", "h-3", "h-4"];
const ROW_KEYS = ["r-1", "r-2", "r-3"];
const CELL_KEYS = ["c-1", "c-2", "c-3", "c-4"];
const HIST_HEADER_KEYS = ["hh-1", "hh-2", "hh-3", "hh-4"];
const HIST_ROW_KEYS = ["hr-1", "hr-2", "hr-3", "hr-4"];
const HIST_CELL_KEYS = ["hc-1", "hc-2", "hc-3", "hc-4"];
const TIMELINE_KEYS = ["t-1", "t-2", "t-3", "t-4", "t-5"];

export default function OrderDetailPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="space-y-6 lg:flex lg:gap-6">
        <div className="flex-1 space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {FIELD_KEYS.map((key) => (
                <div className="flex items-start gap-3" key={key}>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="grid grid-cols-4 gap-4 px-4 py-3">
                {HEADER_KEYS.map((key) => (
                  <Skeleton className="h-4 w-full" key={key} />
                ))}
              </div>
              {ROW_KEYS.map((rowKey) => (
                <div className="grid grid-cols-4 gap-4 px-4 py-3" key={rowKey}>
                  {CELL_KEYS.map((cellKey) => (
                    <Skeleton
                      className="h-4 w-full"
                      key={`${rowKey}-${cellKey}`}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="grid grid-cols-4 gap-4 px-4 py-3">
                {HIST_HEADER_KEYS.map((key) => (
                  <Skeleton className="h-4 w-full" key={key} />
                ))}
              </div>
              {HIST_ROW_KEYS.map((rowKey) => (
                <div className="grid grid-cols-4 gap-4 px-4 py-3" key={rowKey}>
                  {HIST_CELL_KEYS.map((cellKey) => (
                    <Skeleton
                      className="h-4 w-full"
                      key={`${rowKey}-${cellKey}`}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-full space-y-4 lg:w-80">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-3">
              {TIMELINE_KEYS.map((key) => (
                <div className="flex items-center gap-2" key={key}>
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
