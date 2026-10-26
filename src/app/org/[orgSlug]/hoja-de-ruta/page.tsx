import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { RouteSheetView } from "@/components/sales/route-sheet/route-sheet-view";
import { getQueryClient } from "@/lib/get-query-client";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { routeSheetsServerQueryOptions } from "@/modules/route-sheets/queries/queries.server";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

type RouteSheetPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function RouteSheetPage({ params }: RouteSheetPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "route_sheets");

  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    notFound();
  }

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(routeSheetsServerQueryOptions(orgSlug));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RouteSheetView
        canManage={accessContext.canManage}
        canRead={accessContext.canRead}
        orgSlug={orgSlug}
      />
    </HydrationBoundary>
  );
}
