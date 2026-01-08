import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConfigurationPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Organization info skeleton */}
      <div className="rounded-lg border p-6">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="space-y-4">
          {["name", "cuit", "created"].map((field) => (
            <div className="flex items-start gap-3" key={field}>
              <Skeleton className="mt-0.5 size-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {["members", "invitations", "roles", "categories"].map((type) => (
          <Card key={type}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 h-8 w-20" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links skeleton */}
      <div>
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {["members", "roles", "categories"].map((type) => (
            <div className="rounded-lg border p-6" key={type}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-lg" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <Skeleton className="size-5 rounded" />
              </div>
              <Skeleton className="mt-4 h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
