import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SellerMobileHome } from "@/components/mobile/seller-home";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/get-query-client";
import {
  controlTowerQueryOptions,
  financialQueryOptions,
} from "@/modules/dashboard/queries/queries.server";
import { getDateRangeFromPreset } from "@/modules/dashboard/utils/date-utils";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import type { DateRangePreset } from "@/types/dashboard";

type DashboardPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ range?: string; tab?: string }>;
};

// Mobile device regex pattern
const MOBILE_USER_AGENT_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export default async function OrganizationPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { orgSlug } = await params;
  const { range, tab } = await searchParams;

  // Validate date range preset
  const validPresets: DateRangePreset[] = [
    "today",
    "week",
    "month",
    "year",
    "last30",
  ];
  const dateRangePreset: DateRangePreset = validPresets.includes(
    range as DateRangePreset
  )
    ? (range as DateRangePreset)
    : "month";

  const dateRange = getDateRangeFromPreset(dateRangePreset);
  const queryClient = getQueryClient();

  // Get layout data for permissions and user
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/auth/login");
  }

  const { user, permissions } = layoutData;

  // Check if user has permission to view dashboard
  if (!permissions.includes("dashboard.read")) {
    // Redirect to first accessible page
    const routes = [
      { path: `/org/${orgSlug}/ventas`, permission: "sales.read" },
      { path: `/org/${orgSlug}/cobranzas`, permission: "collections.read" },
      { path: `/org/${orgSlug}/clientes`, permission: "customers.read" },
      { path: `/org/${orgSlug}/compras`, permission: "purchases.read" },
      { path: `/org/${orgSlug}/proveedores`, permission: "suppliers.read" },
      { path: `/org/${orgSlug}/stock`, permission: "inventory.read" },
      {
        path: `/org/${orgSlug}/precios/listas-de-precios`,
        permission: "pricelists.read",
      },
    ];

    for (const route of routes) {
      if (permissions.includes(route.permission)) {
        redirect(route.path);
      }
    }

    // If no permissions found, redirect to auth
    redirect("/auth/login");
  }

  // Prefetch all dashboard data upfront for better UX when switching tabs
  try {
    const [controlTowerOptions, financialOptions] = await Promise.all([
      controlTowerQueryOptions(orgSlug, dateRange.from, dateRange.to, {}),
      financialQueryOptions(orgSlug, dateRange.from, dateRange.to, {}),
    ]);

    await Promise.all([
      queryClient.prefetchQuery(controlTowerOptions),
      queryClient.prefetchQuery(financialOptions),
    ]);
  } catch (error) {
    console.error("Error prefetching dashboard data:", error);
  }

  // Validate tab parameter
  const validTabs = ["control", "financial", "analytics"];
  const activeTab = validTabs.includes(tab || "") ? tab : "control";

  // Check if request is from mobile device
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") || "";
  const isMobileDevice = MOBILE_USER_AGENT_REGEX.test(userAgent);

  // On mobile, show the seller home page instead of redirecting
  if (isMobileDevice) {
    return (
      <SellerMobileHome
        orgSlug={orgSlug}
        userName={user?.user_metadata?.full_name as string | undefined}
      />
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardClient
          defaultPreset={dateRangePreset}
          defaultTab={activeTab as "control" | "financial" | "analytics"}
          orgSlug={orgSlug}
        />
      </Suspense>
    </HydrationBoundary>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `kpi-skeleton-${i}`).map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 h-8 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => `card-skeleton-${i}`).map(
          (key) => (
            <Skeleton className="h-48" key={key} />
          )
        )}
      </div>
    </div>
  );
}
