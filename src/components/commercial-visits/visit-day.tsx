"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableCatalogPicker } from "@/components/ui/searchable-catalog-picker";
import { Spinner } from "@/components/ui/spinner";
import {
  type CustomerSite,
  customerSitesSchema,
  type RouteDayResult,
  routeDayResultSchema,
} from "@/modules/commercial-visits/contracts";
import { routeEventLabels } from "@/modules/commercial-visits/route-event-labels";
import { getVisitMapPoints } from "@/modules/commercial-visits/visit-map-points";
import { VisitDocumentDialog } from "./visit-document-dialog";
import { VisitMap } from "./visit-map";
import { VisitPointDialog } from "./visit-point-dialog";

type Route = RouteDayResult["routes"][number];
type Visit = Route["visits"][number];

function visitDescription(visit: Visit): string {
  if (visit.checkedInAt) {
    const method = visit.method === "manual" ? "manualmente" : "con GPS";
    return `Registrada ${method}`;
  }
  if (visit.skipReason) {
    return `Sin visitar: ${visit.skipReason}`;
  }
  return visit.hasLocation ? "Punto aprobado" : "Punto aún no aprobado";
}

function pointActionLabel(visit: Visit): string {
  if (visit.hasPendingLocation) {
    return "Punto pendiente de aprobación";
  }
  return visit.hasLocation
    ? "Proponer cambio de punto"
    : "Proponer punto del cliente";
}

function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: visit actions depend on arrival, route status and correction state
function VisitEntry({
  visit,
  route,
  busy,
  send,
  orgSlug,
}: {
  visit: Visit;
  route: Route;
  busy: boolean;
  send: (command: Record<string, unknown>) => Promise<boolean>;
  orgSlug: string;
}) {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showPoint, setShowPoint] = useState(false);
  const [correction, setCorrection] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);

  const visited = !!visit.checkedInAt;
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words font-medium">
            {visit.plannedPosition}. {visit.customerName}
          </p>
          <span className="shrink-0 text-muted-foreground text-xs">
            {visited
              ? `Llegada ${new Date(visit.checkedInAt ?? "").toLocaleString("es-AR")}`
              : "Pendiente"}
          </span>
        </div>
        <p className="break-words text-muted-foreground text-sm [overflow-wrap:anywhere]">
          Sucursal: {visit.siteName ?? "Principal"}
          {visit.siteAddress ? ` · ${visit.siteAddress}` : ""}
        </p>
        <p className="text-muted-foreground text-sm">
          {visitDescription(visit)}
        </p>
        {visit.correctedAt && (
          <p className="text-amber-700 text-sm">
            Registro equivocado: {visit.correctionReason}. La evidencia original
            permanece.
          </p>
        )}
        {route.status === "open" && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || visit.plannedPosition === 1}
              onClick={() => {
                const ids = route.visits.map((entry) => entry.id);
                const position = ids.indexOf(visit.id);
                [ids[position - 1], ids[position]] = [
                  ids[position],
                  ids[position - 1],
                ];
                send({
                  action: "reorder",
                  routeId: route.id,
                  visitIds: ids,
                });
              }}
              size="sm"
              variant="outline"
            >
              Subir
            </Button>
            <Button
              disabled={busy || visit.plannedPosition === route.visits.length}
              onClick={() => {
                const ids = route.visits.map((entry) => entry.id);
                const position = ids.indexOf(visit.id);
                [ids[position + 1], ids[position]] = [
                  ids[position],
                  ids[position + 1],
                ];
                send({
                  action: "reorder",
                  routeId: route.id,
                  visitIds: ids,
                });
              }}
              size="sm"
              variant="outline"
            >
              Bajar
            </Button>
            {!visited && (
              <Button
                disabled={busy}
                onClick={() => setShowDocuments(true)}
                size="sm"
              >
                Registrar visita
              </Button>
            )}
          </div>
        )}
        {visited && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => setShowDocuments(true)}
              size="sm"
              variant="outline"
            >
              Ver o vincular documentos
            </Button>
            <Button
              disabled={busy || visit.hasPendingLocation}
              onClick={() => setShowPoint(true)}
              size="sm"
              variant="outline"
            >
              {pointActionLabel(visit)}
            </Button>
          </div>
        )}
        <VisitDocumentDialog
          customerName={visit.customerName}
          onOpenChange={setShowDocuments}
          open={showDocuments}
          orgSlug={orgSlug}
          send={send}
          siteName={visit.siteName ?? "Principal"}
          visited={visited}
          visitId={visit.id}
        />
        <VisitPointDialog
          customerName={visit.customerName}
          onOpenChange={setShowPoint}
          open={showPoint}
          send={send}
          siteName={visit.siteName ?? "Principal"}
          visitId={visit.id}
        />
        {visited && !visit.correctedAt && (
          <>
            <Button
              disabled={busy}
              onClick={() => setShowCorrection(!showCorrection)}
              size="sm"
              variant="ghost"
            >
              Marcar registro equivocado
            </Button>
            {showCorrection && (
              <div className="space-y-2">
                <textarea
                  aria-label="Motivo de corrección"
                  className="w-full rounded-md border bg-background p-2"
                  maxLength={1000}
                  onChange={(event) => setCorrection(event.target.value)}
                  value={correction}
                />
                <Button
                  disabled={busy || !correction.trim()}
                  onClick={() =>
                    send({
                      action: "correctVisit",
                      visitId: visit.id,
                      reason: correction,
                    }).then((saved) => {
                      if (saved) {
                        setShowCorrection(false);
                      }
                    })
                  }
                  size="sm"
                >
                  Guardar corrección sin borrar GPS
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RouteCard({
  route,
  customers,
  busy,
  send,
  orgSlug,
}: {
  route: Route;
  customers: RouteDayResult["customers"];
  busy: boolean;
  send: (command: Record<string, unknown>) => Promise<boolean>;
  orgSlug: string;
}) {
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [showClose, setShowClose] = useState(false);
  const pending = route.visits.filter((visit) => !visit.checkedInAt);
  const actual = route.visits
    .filter((visit) => visit.checkedInAt)
    .sort((left, right) =>
      (left.checkedInAt ?? "").localeCompare(right.checkedInAt ?? "")
    );
  const available = customers.filter((customer) =>
    customer.sites.some(
      (site) =>
        !route.visits.some(
          (visit) =>
            visit.customerId === customer.id && visit.siteId === site.id
        )
    )
  );
  const availableSites =
    customers
      .find((customer) => customer.id === customerId)
      ?.sites.filter(
        (site) =>
          !route.visits.some(
            (visit) =>
              visit.customerId === customerId && visit.siteId === site.id
          )
      ) ?? [];
  return (
    <section className="min-w-0 space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">
          {route.number === 1
            ? "Ruta principal"
            : `Ruta adicional ${route.number}`}{" "}
          · {route.status === "open" ? "Abierta" : "Cerrada"}
        </h2>
        {route.status === "closed" && (
          <Button
            disabled={busy}
            onClick={() => send({ action: "reopenRoute", routeId: route.id })}
            variant="outline"
          >
            Reabrir ruta
          </Button>
        )}
      </div>
      {route.status === "open" && (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0 space-y-1 text-sm">
            <span>Cliente</span>
            <SearchableCatalogPicker
              label={`Cliente para ruta ${route.number}`}
              onChange={(value) => {
                setCustomerId(value);
                setSiteId("");
              }}
              options={available.map((customer) => ({
                value: customer.id,
                label: customer.name,
              }))}
              placeholder="Buscar cliente"
              searchPlaceholder="Buscar cliente por nombre"
              value={customerId}
            />
          </div>
          <label className="min-w-0 space-y-1 text-sm">
            <span>Sucursal</span>
            <select
              aria-label="Sucursal para visitar"
              className="h-11 w-full min-w-0 max-w-full truncate rounded-md border bg-background p-2 text-base md:h-9 md:text-sm"
              disabled={!customerId}
              onChange={(event) => setSiteId(event.target.value)}
              value={siteId}
            >
              <option value="">Elegí una sucursal</option>
              {availableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} · {site.address || "Sin dirección"}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="w-full sm:w-auto"
            disabled={busy || !customerId || !siteId}
            onClick={() =>
              send({
                action: "addToRoute",
                routeId: route.id,
                customerId,
                siteId,
              }).then((saved) => {
                if (saved) {
                  setCustomerId("");
                  setSiteId("");
                }
              })
            }
          >
            Agregar
          </Button>
        </div>
      )}
      {route.visits.length === 0 && (
        <p className="text-muted-foreground text-sm">Sin clientes todavía.</p>
      )}
      {route.visits.map((visit) => (
        <VisitEntry
          busy={busy}
          key={visit.id}
          orgSlug={orgSlug}
          route={route}
          send={send}
          visit={visit}
        />
      ))}
      <p className="break-words text-muted-foreground text-sm [overflow-wrap:anywhere]">
        Orden real:{" "}
        {actual.length
          ? actual
              .map(
                (visit, index) =>
                  `${index + 1}. ${visit.customerName} · ${visit.siteName ?? "Principal"}${visit.correctedAt ? " (registro observado)" : ""}`
              )
              .join(" → ")
          : "sin llegadas registradas"}
        . El orden planificado se mantiene por separado.
      </p>
      {route.status === "open" && (
        <>
          <Button
            disabled={busy}
            onClick={() => setShowClose(!showClose)}
            variant="outline"
          >
            Cerrar ruta
          </Button>
          {showClose && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm">
                {pending.length
                  ? "Indicá un motivo para cada cliente no visitado."
                  : "Todos los clientes tienen llegada registrada."}
              </p>
              {pending.map((visit) => (
                <label className="block space-y-1 text-sm" key={visit.id}>
                  <span>
                    {visit.customerName} · {visit.siteName ?? "Principal"}
                  </span>
                  <textarea
                    className="w-full rounded-md border bg-background p-2"
                    maxLength={1000}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [visit.id]: event.target.value,
                      }))
                    }
                    placeholder="Motivo de no visita"
                    value={reasons[visit.id] ?? ""}
                  />
                </label>
              ))}
              <Button
                disabled={
                  busy || pending.some((visit) => !reasons[visit.id]?.trim())
                }
                onClick={() =>
                  send({
                    action: "closeRoute",
                    routeId: route.id,
                    reasons: Object.fromEntries(
                      pending.map((visit) => [
                        visit.id,
                        reasons[visit.id]?.trim() ?? "",
                      ])
                    ),
                  }).then((saved) => {
                    if (saved) {
                      setShowClose(false);
                      setReasons({});
                    }
                  })
                }
              >
                Confirmar cierre
              </Button>
            </div>
          )}
        </>
      )}
      {route.events.length > 0 && (
        <details className="text-muted-foreground text-xs">
          <summary>Historial de ruta ({route.events.length})</summary>
          {route.events.map((event, index) => (
            <p key={`${event.createdAt}-${index}`}>
              {new Date(event.createdAt).toLocaleString("es-AR")} ·{" "}
              {routeEventLabels[event.action]} ·{" "}
              {event.actorName ?? "Usuario no disponible"}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}

export function VisitDay({ orgSlug }: { orgSlug: string }) {
  const [day, setDay] = useState("");
  const [data, setData] = useState<RouteDayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [mapSites, setMapSites] = useState<CustomerSite[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const loadSequence = useRef(0);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/commercial-visits`;
  const mapPoints = useMemo(
    () => (data ? getVisitMapPoints(data, mapSites) : []),
    [data, mapSites]
  );
  const load = useCallback(
    async (selectedDay: string) => {
      loadSequence.current += 1;
      const sequence = loadSequence.current;
      const response = await fetch(`${url}?view=routes&day=${selectedDay}`, {
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (result as { error?: string }).error ??
            "No se pudieron cargar las rutas"
        );
      }
      const parsed = routeDayResultSchema.parse(result);
      if (sequence === loadSequence.current) {
        setData(parsed);
      }
    },
    [url]
  );
  const loadMapSites = useCallback(async () => {
    try {
      const response = await fetch(`${url}?view=mapSites`, {
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (result as { error?: string }).error ??
            "No se pudieron cargar los puntos del mapa"
        );
      }
      setMapSites(customerSitesSchema.parse(result));
      setMapError(null);
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "No se pudo cargar el mapa"
      );
    } finally {
      setLoadingMap(false);
    }
  }, [url]);
  useEffect(() => {
    const current = todayLocal();
    setDay(current);
    load(current)
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Error al cargar rutas"
        )
      )
      .finally(() => setLoadingRoutes(false));
    loadMapSites();
  }, [load, loadMapSites]);
  useEffect(() => {
    const refresh = () => {
      if (day !== todayLocal() || document.visibilityState !== "visible") {
        return;
      }
      load(day).catch(() => {
        // Preserve the current route list when a background refresh fails.
      });
      loadMapSites();
    };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [day, load, loadMapSites]);
  async function send(command: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo guardar la ruta");
      }
      await load(day);
      loadMapSites();
      toast.success("Ruta actualizada");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar"
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 pb-24">
      {busy && (
        <output className="fixed right-4 bottom-20 left-4 z-40 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-lg border bg-background p-3 shadow-lg md:bottom-4">
          <Spinner aria-label="Guardando" /> Guardando cambios…
        </output>
      )}
      <div>
        <h1 className="font-heading text-2xl">Mis rutas comerciales</h1>
        <p className="text-muted-foreground text-sm">
          Podés crear varios recorridos el mismo día. El GPS se solicita
          únicamente al registrar una llegada; las rutas requieren conexión.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Fecha del recorrido</span>
        <input
          className="block rounded-md border bg-background p-2"
          max={todayLocal()}
          onChange={(event) => {
            setDay(event.target.value);
            setData(null);
            setLoadingRoutes(true);
            load(event.target.value)
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "No se pudieron cargar las rutas"
                )
              )
              .finally(() => setLoadingRoutes(false));
          }}
          type="date"
          value={day}
        />
      </label>
      {loadingRoutes && (
        <output className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner aria-label="Cargando" /> Cargando visitas…
        </output>
      )}
      {!loadingRoutes && data && (
        <div className="space-y-2">
          {mapError && (
            <div className="flex flex-wrap items-center gap-2 text-destructive text-sm">
              No se pudieron cargar los puntos: {mapError}
              <Button
                onClick={() => loadMapSites()}
                size="sm"
                variant="outline"
              >
                Reintentar
              </Button>
            </div>
          )}
          {loadingMap && (
            <output className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner aria-label="Cargando" /> Cargando mapa…
            </output>
          )}
          {!(loadingMap || mapError) && <VisitMap points={mapPoints} />}
        </div>
      )}
      {data?.routes.map((route) => (
        <RouteCard
          busy={busy}
          customers={data.customers}
          key={route.id}
          orgSlug={orgSlug}
          route={route}
          send={send}
        />
      ))}
      <Button
        disabled={
          busy ||
          !day ||
          day < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
        }
        loading={busy}
        loadingText="Guardando ruta…"
        onClick={() => send({ action: "createRoute", day })}
      >
        {data?.routes.length
          ? "Iniciar ruta adicional"
          : "Iniciar ruta principal"}
      </Button>
    </main>
  );
}
