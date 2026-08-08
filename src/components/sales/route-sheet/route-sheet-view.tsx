"use client";

import { PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouteSheets } from "@/modules/route-sheets/hooks/use-route-sheets";
import { RouteSheetCarrierGroup } from "./route-sheet-carrier-group";
import { RouteSheetDialog } from "./route-sheet-dialog";

export function RouteSheetView({
  canManage,
  orgSlug,
}: {
  canManage: boolean;
  orgSlug: string;
}) {
  const { data, isLoading, isError } = useRouteSheets(orgSlug);
  const [createOpen, setCreateOpen] = useState(false);

  let content: ReactNode;

  if (isLoading) {
    content = (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => `route-sheet-${index}`).map(
          (key) => (
            <Skeleton className="h-24 w-full" key={key} />
          )
        )}
      </div>
    );
  } else if (isError || !data) {
    content = (
      <p className="text-destructive text-sm">
        No se pudieron cargar las hojas de ruta.
      </p>
    );
  } else if (data.routeSheets.length === 0) {
    content = (
      <Empty>
        <EmptyContent>
          <EmptyHeader>
            <EmptyTitle>Sin hojas de ruta</EmptyTitle>
            <EmptyDescription>
              Creá tu primera hoja de ruta para organizar los despachos de un
              transporte.
            </EmptyDescription>
          </EmptyHeader>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <div className="space-y-4">
        {data.routeSheets.map((routeSheet) => (
          <RouteSheetCarrierGroup
            canManage={canManage}
            key={routeSheet.id}
            orgSlug={orgSlug}
            routeSheet={routeSheet}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Hoja de Ruta</h1>
          <p className="text-muted-foreground text-sm">
            Organizá los despachos de cada transporte por fecha.
          </p>
        </div>
        {canManage && (
          <Button
            className="w-full md:w-auto"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva hoja de ruta
          </Button>
        )}
      </div>

      {content}

      <RouteSheetDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
        orgSlug={orgSlug}
      />
    </div>
  );
}
