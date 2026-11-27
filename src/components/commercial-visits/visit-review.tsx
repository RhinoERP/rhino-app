"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  type ReviewQueue,
  reviewQueueSchema,
  routeAdminListSchema,
  type SiteProposal,
  siteProposalsSchema,
  visitAdminDaySchema,
} from "@/modules/commercial-visits/contracts";
import { VisitDocumentDialog } from "./visit-document-dialog";

function gpsSummary(
  method: string,
  latitude: number | null,
  accuracy: number | null
) {
  if (method === "manual") {
    return "Sin GPS";
  }
  if (latitude === null) {
    return "GPS eliminado por retención";
  }
  return `GPS ±${Math.round(accuracy ?? 0)} m`;
}

export function VisitReview({ orgSlug }: { orgSlug: string }) {
  const [data, setData] = useState<ReviewQueue | null>(null);
  const [routes, setRoutes] = useState<
    ReturnType<typeof routeAdminListSchema.parse>
  >([]);
  const [busy, setBusy] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<{
    id: string;
    customer: string;
  } | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [siteRejection, setSiteRejection] = useState<string | null>(null);
  const [siteProposals, setSiteProposals] = useState<SiteProposal[]>([]);
  const [siteReason, setSiteReason] = useState("");
  const [historyDay, setHistoryDay] = useState("");
  const [historicalVisits, setHistoricalVisits] = useState<ReturnType<
    typeof visitAdminDaySchema.parse
  > | null>(null);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/commercial-visits`;

  const load = useCallback(async () => {
    const response = await fetch(`${url}?view=review`, { cache: "no-store" });
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        (result as { error?: string }).error ?? "No se pudo cargar la revisión"
      );
    }
    setData(reviewQueueSchema.parse(result));
    const routeResponse = await fetch(`${url}?view=adminRoutes`, {
      cache: "no-store",
    });
    const routeResult: unknown = await routeResponse.json();
    if (!routeResponse.ok) {
      throw new Error("No se pudieron cargar las rutas comerciales");
    }
    setRoutes(routeAdminListSchema.parse(routeResult));
    const proposalResponse = await fetch(`${url}?view=siteProposals`, {
      cache: "no-store",
    });
    const proposalResult: unknown = await proposalResponse.json();
    if (!proposalResponse.ok) {
      throw new Error(
        (proposalResult as { error?: string }).error ??
          "No se pudieron cargar las sucursales propuestas"
      );
    }
    setSiteProposals(siteProposalsSchema.parse(proposalResult));
  }, [url]);

  useEffect(() => {
    load().catch((error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Error al cargar visitas"
      )
    );
  }, [load]);

  async function submit(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo guardar la revisión");
      }
      await load();
      toast.success("Revisión guardada");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(day: string) {
    if (!day) {
      setHistoricalVisits(null);
      return;
    }
    try {
      const response = await fetch(`${url}?view=adminDay&day=${day}`, {
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (result as { error?: string }).error ??
            "No se pudo cargar el historial"
        );
      }
      setHistoricalVisits(visitAdminDaySchema.parse(result));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el historial"
      );
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-24">
      {busy && (
        <output className="fixed right-4 bottom-20 left-4 z-40 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-lg border bg-background p-3 shadow-lg md:bottom-4">
          <Spinner aria-label="Guardando" /> Guardando revisión…
        </output>
      )}
      <div>
        <h1 className="font-heading text-2xl">Revisión de visitas</h1>
        <p className="text-muted-foreground text-sm">
          Las visitas cuentan desde que el vendedor las confirma. Podés
          consultar su ubicación temporal y sus documentos; solo se aprueban las
          propuestas de puntos permanentes de clientes.
        </p>
      </div>
      <h2 className="font-semibold">Rutas recientes</h2>
      {routes.length === 0 && (
        <p className="text-muted-foreground text-sm">No hay rutas recientes.</p>
      )}
      {routes.map((route) => (
        <Card key={route.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <p>
              {route.day} · {route.sellerName} · Ruta {route.number} ·{" "}
              {route.status === "closed" ? "Cerrada" : "Abierta"}
            </p>
            {route.status === "closed" && (
              <Button
                disabled={busy}
                onClick={() =>
                  submit({ action: "reopenRoute", routeId: route.id })
                }
                variant="outline"
              >
                Reabrir
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">Cumplimiento reciente</h2>
      <p className="text-muted-foreground text-sm">
        Hoy y ayer según fecha del servidor. Las ubicaciones del mapa son puntos
        de clientes aprobados, no la posición actual del vendedor.
      </p>
      {data && (
        <p className="text-muted-foreground text-sm">
          {data.dayOverview.filter((visit) => visit.checkedInAt).length}{" "}
          llegadas registradas de {data.dayOverview.length} planificadas.
        </p>
      )}
      {data?.dayOverview.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No hay visitas planificadas recientemente.
        </p>
      )}
      {data?.dayOverview.map((visit) => (
        <Card key={visit.id}>
          <CardContent className="space-y-1 p-4">
            <p className="font-medium">
              {visit.customerName} · {visit.sellerName}
              {visit.siteName && ` · ${visit.siteName}`}
            </p>
            <p className="text-muted-foreground text-sm">
              {visit.visitDate} ·{" "}
              {visit.checkedInAt ? "Realizada" : "Planificada"}
              {visit.reviewStatus === "rejected" && " · Observación histórica"}
            </p>
            {visit.latitude !== null && visit.longitude !== null && (
              <a
                className="text-primary text-sm underline"
                href={`https://www.openstreetmap.org/?mlat=${visit.latitude}&mlon=${visit.longitude}#map=17/${visit.latitude}/${visit.longitude}`}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                target="_blank"
              >
                Ver cliente en mapa externo
              </a>
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">Visitas registradas recientemente</h2>
      {data?.visits.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No hay visitas recientes.
        </p>
      )}
      {data?.visits.map((visit) => (
        <Card key={visit.id}>
          <CardContent className="space-y-2 p-4">
            <p className="font-medium">
              {visit.customerName} · {visit.siteName ?? "Principal"}
            </p>
            <p className="text-muted-foreground text-sm">
              Vendedor: {visit.sellerName} ·{" "}
              {new Date(visit.checkedInAt).toLocaleString("es-AR")} ·{" "}
              {visit.method === "manual"
                ? "sin GPS"
                : `GPS (±${Math.round(visit.accuracyM ?? 0)} m)`}
            </p>
            {visit.distanceM !== null && (
              <p className="text-muted-foreground text-sm">
                Distancia aproximada al punto aprobado: {visit.distanceM} m.
                Revisar junto con la precisión del GPS; no confirma presencia
                automáticamente.
              </p>
            )}
            {visit.latitude !== null && visit.longitude !== null && (
              <a
                className="text-primary text-sm underline"
                href={`https://www.openstreetmap.org/?mlat=${visit.latitude}&mlon=${visit.longitude}#map=17/${visit.latitude}/${visit.longitude}`}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                target="_blank"
              >
                Ver punto en mapa externo
              </a>
            )}
            <Button
              disabled={busy}
              onClick={() =>
                setSelectedVisit({ id: visit.id, customer: visit.customerName })
              }
              variant="outline"
            >
              Ver documentos y vínculos
            </Button>
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">Consultar visitas históricas</h2>
      <p className="text-muted-foreground text-sm">
        El historial comercial se conserva; después de 30 días ya no muestra
        GPS.
      </p>
      <input
        aria-label="Fecha del historial"
        className="rounded-md border bg-background p-2"
        max={new Date().toISOString().slice(0, 10)}
        onChange={(event) => {
          setHistoryDay(event.target.value);
          loadHistory(event.target.value);
        }}
        type="date"
        value={historyDay}
      />
      {historicalVisits?.length === 0 && (
        <p className="text-sm">No hay visitas registradas ese día.</p>
      )}
      {historicalVisits?.map((visit) => (
        <Card key={visit.id}>
          <CardContent className="space-y-2 p-4">
            <p>
              {visit.customerName} · {visit.sellerName} ·{" "}
              {visit.siteName ?? "Principal"} ·{" "}
              {new Date(visit.checkedInAt).toLocaleString("es-AR")}
            </p>
            <p className="text-muted-foreground text-sm">
              {gpsSummary(visit.method, visit.latitude, visit.accuracyM)}
            </p>
            <Button
              onClick={() =>
                setSelectedVisit({ id: visit.id, customer: visit.customerName })
              }
              variant="outline"
            >
              Ver documentos y vínculos
            </Button>
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">Puntos propuestos para clientes</h2>
      <p className="text-muted-foreground text-sm">
        Se proponen explícitamente. Una corrección no reemplaza el punto vigente
        hasta que se aprueba.
      </p>
      {data?.locations.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No hay puntos pendientes.
        </p>
      )}
      {data?.locations.map((location) => (
        <Card key={location.proposalId}>
          <CardContent className="space-y-2 p-4">
            <p className="font-medium">
              {location.customerName} · {location.siteName ?? "Principal"}
            </p>
            {location.address && location.city && (
              <p className="text-sm">
                Nueva dirección propuesta: {location.address}, {location.city}
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              {location.method === "gps" && location.accuracyM !== null
                ? `GPS reportado: ±${Math.round(location.accuracyM)} m.`
                : "Pin manual"}
            </p>
            <a
              className="text-primary text-sm underline"
              href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`}
              referrerPolicy="no-referrer"
              rel="noopener noreferrer"
              target="_blank"
            >
              Revisar punto en mapa externo
            </a>
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  submit({
                    action: "decideLocation",
                    proposalId: location.proposalId,
                    approved: true,
                  })
                }
              >
                Aprobar punto
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  setRejection(
                    rejection === location.proposalId
                      ? null
                      : location.proposalId
                  )
                }
                variant="outline"
              >
                Rechazar
              </Button>
            </div>
            {rejection === location.proposalId && (
              <div className="flex gap-2">
                <input
                  aria-label="Motivo del rechazo"
                  className="min-w-0 flex-1 rounded-md border p-2"
                  id={`reject-${location.proposalId}`}
                  maxLength={1000}
                  placeholder="Motivo del rechazo"
                />
                <Button
                  disabled={busy}
                  onClick={() => {
                    const reason = (
                      document.getElementById(
                        `reject-${location.proposalId}`
                      ) as HTMLInputElement
                    )?.value.trim();
                    if (reason) {
                      submit({
                        action: "decideLocation",
                        proposalId: location.proposalId,
                        approved: false,
                        reason,
                      });
                    } else {
                      toast.error("Ingresá el motivo del rechazo");
                    }
                  }}
                >
                  Confirmar rechazo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">
        Sucursales y puntos propuestos desde clientes
      </h2>
      <p className="text-muted-foreground text-sm">
        Las propuestas de vendedores no modifican las sucursales hasta que un
        administrador revise y apruebe cada punto.
      </p>
      {siteProposals.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No hay sucursales pendientes de aprobación.
        </p>
      )}
      {siteProposals.map((proposal) => (
        <Card key={proposal.id}>
          <CardContent className="space-y-2 p-4">
            <p className="font-medium">
              {proposal.customerName} · {proposal.name}
              {proposal.siteId ? " (cambio de sucursal)" : " (nueva sucursal)"}
            </p>
            <p className="text-sm">
              {proposal.address}, {proposal.city}
              {proposal.postalCode && ` · CP ${proposal.postalCode}`}
            </p>
            <a
              className="text-primary text-sm underline"
              href={`https://www.openstreetmap.org/?mlat=${proposal.latitude}&mlon=${proposal.longitude}#map=17/${proposal.latitude}/${proposal.longitude}`}
              referrerPolicy="no-referrer"
              rel="noopener noreferrer"
              target="_blank"
            >
              Revisar punto en mapa externo
            </a>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  submit({
                    action: "decideSiteProposal",
                    proposalId: proposal.id,
                    approved: true,
                  })
                }
              >
                Aprobar sucursal y punto
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setSiteRejection(
                    siteRejection === proposal.id ? null : proposal.id
                  );
                  setSiteReason("");
                }}
                variant="outline"
              >
                Rechazar
              </Button>
            </div>
            {siteRejection === proposal.id && (
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label="Motivo de rechazo de la sucursal"
                  className="min-w-0 flex-1 rounded-md border p-2"
                  maxLength={1000}
                  onChange={(event) => setSiteReason(event.target.value)}
                  placeholder="Motivo de rechazo"
                  value={siteReason}
                />
                <Button
                  disabled={busy || !siteReason.trim()}
                  onClick={() =>
                    submit({
                      action: "decideSiteProposal",
                      proposalId: proposal.id,
                      approved: false,
                      reason: siteReason.trim(),
                    }).then((saved) => {
                      if (saved) {
                        setSiteRejection(null);
                        setSiteReason("");
                      }
                    })
                  }
                >
                  Confirmar rechazo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="font-semibold">Cumplimiento mensual</h2>
      <p className="text-muted-foreground text-sm">
        Combina agregados anteriores con visitas conservadas, sin contarlas dos
        veces. El GPS de cada visita se elimina a los 30 días.
      </p>
      {data?.monthlyMetrics.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Todavía no hay meses archivados.
        </p>
      )}
      {data?.monthlyMetrics.map((metric) => (
        <Card key={`${metric.sellerId}-${metric.month}`}>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">
              {metric.month} · {metric.sellerName}
            </p>
            <p className="text-muted-foreground">
              {metric.visits} visitas registradas · {metric.confirmed}{" "}
              confirmadas · {metric.manual} sin GPS
            </p>
          </CardContent>
        </Card>
      ))}
      {selectedVisit && (
        <VisitDocumentDialog
          allowMove
          customerName={selectedVisit.customer}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedVisit(null);
            }
          }}
          open
          orgSlug={orgSlug}
          send={submit}
          visited
          visitId={selectedVisit.id}
        />
      )}
    </main>
  );
}
