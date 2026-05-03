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
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import type { DashboardTab, DateRangePreset } from "@/types/dashboard";

type DashboardPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ range?: string; tab?: string }>;
};

type AccessibleRoute = {
  path: string;
  permission: string;
  module?: "wholesale" | "pos";
};

// Mobile device regex pattern
const MOBILE_USER_AGENT_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const VALID_PRESETS: DateRangePreset[] = [
  "today",
  "week",
  "month",
  "year",
  "last30",
  "lastYear",
];
const VALID_TABS: DashboardTab[] = [
  "control",
  "financial",
  "direct-sales",
  "analytics",
];

function resolveDateRangePreset(range?: string): DateRangePreset {
  if (!range) {
    return "month";
  }
  return VALID_PRESETS.includes(range as DateRangePreset)
    ? (range as DateRangePreset)
    : "month";
}

function redirectToFirstAccessibleRoute(
  routes: AccessibleRoute[],
  permissions: string[],
  currentOrganization: {
    wholesale_enabled: boolean;
    pos_enabled: boolean;
  }
): never {
  for (const route of routes) {
    if (
      permissions.includes(route.permission) &&
      (!route.module ||
        isOrganizationModuleEnabled(currentOrganization, route.module))
    ) {
      redirect(route.path);
    }
  }

  redirect("/auth/login");
}

async function prefetchDashboardData(
  orgSlug: string,
  dateRange: { from: Date; to: Date },
  queryClient: ReturnType<typeof getQueryClient>
) {
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
}

async function isMobileRequest() {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") || "";
  return MOBILE_USER_AGENT_REGEX.test(userAgent);
}

function resolveActiveTab(tab?: string): DashboardTab {
  const candidate = (tab ?? "control") as DashboardTab;
  return VALID_TABS.includes(candidate) ? candidate : "control";
}

export default async function OrganizationPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { orgSlug } = await params;
  const { range, tab } = await searchParams;

  const dateRangePreset = resolveDateRangePreset(range);

  const dateRange = getDateRangeFromPreset(dateRangePreset);
  const queryClient = getQueryClient();

  // Get layout data for permissions and user
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/auth/login");
  }

  const { user, permissions, currentOrganization } = layoutData;

  // Check if user has permission to view dashboard
  if (!permissions.includes("dashboard.read")) {
    const routes: AccessibleRoute[] = [
      {
        path: `/org/${orgSlug}/ventas`,
        permission: "sales.read",
        module: "wholesale" as const,
      },
      {
        path: `/org/${orgSlug}/venta-directa`,
        permission: "pos.read",
        module: "pos" as const,
      },
      {
        path: `/org/${orgSlug}/cobranzas`,
        permission: "collections.read",
      },
      { path: `/org/${orgSlug}/clientes`, permission: "customers.read" },
      { path: `/org/${orgSlug}/compras`, permission: "purchases.read" },
      { path: `/org/${orgSlug}/proveedores`, permission: "suppliers.read" },
      { path: `/org/${orgSlug}/stock`, permission: "inventory.read" },
      {
        path: `/org/${orgSlug}/precios/listas-de-precios`,
        permission: "pricelists.read",
      },
    ];

    redirectToFirstAccessibleRoute(routes, permissions, currentOrganization);
  }

  await prefetchDashboardData(orgSlug, dateRange, queryClient);

  // Validate tab parameter
  const activeTab = resolveActiveTab(tab);

  const isMobileDevice = await isMobileRequest();

  // On mobile, show the seller home page instead of redirecting
  if (isMobileDevice) {
    return (
      <SellerMobileHome
        orgSlug={orgSlug}
        posEnabled={currentOrganization.pos_enabled ?? true}
        userName={user?.user_metadata?.full_name as string | undefined}
        wholesaleEnabled={currentOrganization.wholesale_enabled ?? true}
      />
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardClient
          defaultPreset={dateRangePreset}
          defaultTab={activeTab}
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
