import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const FORM_FIELD_KEYS = [
  "customer",
  "seller",
  "sale-date",
  "expiration-date",
  "invoice-type",
  "taxes",
];

const FILTER_KEYS = ["supplier", "brand", "category"];
const PRODUCT_ROW_KEYS = ["product-1", "product-2", "product-3"];
const SUMMARY_ROWS = [
  "products",
  "units",
  "subtotal",
  "taxes",
  "discount",
  "total",
];

export default function PreSalePageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                {FORM_FIELD_KEYS.slice(0, 2).map((key) => (
                  <div className="space-y-2" key={key}>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {FORM_FIELD_KEYS.slice(2, 4).map((key) => (
                  <div className="space-y-2" key={key}>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {FORM_FIELD_KEYS.slice(4, 6).map((key) => (
                  <div className="space-y-2" key={key}>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-24 w-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <Skeleton className="h-6 w-40" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-64" />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {FILTER_KEYS.map((key) => (
                  <div className="space-y-2" key={key}>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                {PRODUCT_ROW_KEYS.map((rowKey) => (
                  <div className="grid gap-3 sm:grid-cols-4" key={rowKey}>
                    <div className="space-y-2 sm:col-span-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <div className="sticky top-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Skeleton className="h-6 w-36" />
                </CardTitle>
                <CardDescription>
                  <Skeleton className="h-4 w-56" />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  {SUMMARY_ROWS.map((rowKey) => (
                    <div
                      className="flex items-center justify-between"
                      key={rowKey}
                    >
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                  <Separator />
                  <Skeleton className="h-3 w-36" />
                </div>
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  <Skeleton className="h-5 w-40" />
                </CardTitle>
                <CardDescription>
                  <Skeleton className="h-4 w-52" />
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-28" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
