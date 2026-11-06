"use client";

import { MapPinIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { recordVisitAction } from "@/modules/commercial-ai/actions/prospecting.actions";
import { CheckinLocationLine } from "./checkins-view";
import { useCommercialAi } from "./shared";
import { VisitResultPicker } from "./visit-location";

/** "Registrar visita" fuera de una ruta: guarda resultado, nota y ubicación. */
export function VisitButton({
  customerId,
  prospectId,
}: {
  customerId?: string;
  prospectId?: string;
}) {
  const { snapshot } = useCommercialAi();
  const [open, setOpen] = useState(false);
  const accountId = customerId ?? prospectId;
  const last = snapshot.prospecting.checkins.find(
    (c) => c.accountId === accountId
  );

  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-sm">Visitas</p>
        <Button
          className="ml-auto"
          onClick={() => setOpen((v) => !v)}
          size="sm"
          variant={open ? "ghost" : "outline"}
        >
          <MapPinIcon />
          {open ? "Cancelar" : "Registrar visita"}
        </Button>
      </div>
      {open ? (
        <VisitResultPicker
          onSave={async (result, note, location) => {
            const response = await recordVisitAction(snapshot.orgSlug, {
              customerId: customerId ?? null,
              prospectId: prospectId ?? null,
              result,
              note,
              location,
            });
            if (response.success) {
              setOpen(false);
            }
            return response;
          }}
        />
      ) : null}
      {last ? (
        <div className="text-sm">
          <p className="text-muted-foreground text-xs">
            Última visita registrada por {last.userName ?? "el equipo"} el{" "}
            {new Intl.DateTimeFormat("es-AR", {
              day: "2-digit",
              month: "2-digit",
              timeZone: "America/Argentina/Buenos_Aires",
            }).format(new Date(last.createdAt))}
          </p>
          <CheckinLocationLine checkin={last} />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Todavía no hay visitas registradas.
        </p>
      )}
    </div>
  );
}
