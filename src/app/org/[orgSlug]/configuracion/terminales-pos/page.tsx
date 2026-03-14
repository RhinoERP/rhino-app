import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { AddPosTerminalDialog } from "@/components/pos-terminals/add-pos-terminal-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { posTerminalsServerQueryOptions } from "@/modules/pos/queries/pos.server";
import { PosTerminalsDataTable } from "./data-table";

type PosTerminalsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PosTerminalsPage({
  params,
}: PosTerminalsPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery(posTerminalsServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Terminales POS</h1>
          <p className="text-muted-foreground text-sm">
            Crea y administra las cajas utilizadas en venta directa.
          </p>
        </div>
        <AddPosTerminalDialog orgSlug={orgSlug} />
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <PosTerminalsDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}
