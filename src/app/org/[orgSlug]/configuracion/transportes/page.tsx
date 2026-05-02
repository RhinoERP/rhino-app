import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { CarrierDialog } from "@/components/carriers/carrier-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { carriersServerQueryOptions } from "@/modules/carriers/queries/queries.server";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { CarriersDataTable } from "./data-table";

type TransportesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function TransportesPage({
  params,
}: TransportesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const [settings] = await Promise.all([
    getOrgSettings(orgSlug),
    queryClient.prefetchQuery(carriersServerQueryOptions(orgSlug)),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Transportes</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los transportes disponibles para esta organización.
          </p>
        </div>
        <CarrierDialog orgSlug={orgSlug} />
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CarriersDataTable
          orgSlug={orgSlug}
          requireCarrierOnDispatch={settings.require_carrier_on_dispatch}
        />
      </HydrationBoundary>
    </div>
  );
}
