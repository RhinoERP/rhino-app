"use client";

import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  History,
  Link2,
  MapPin,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type VisitDocumentCandidates,
  type VisitDocumentHistory,
  visitDocumentCandidatesSchema,
  visitDocumentHistorySchema,
} from "@/modules/commercial-visits/contracts";
import {
  availableVisitDocuments,
  visitDocumentStatusLabel,
} from "@/modules/commercial-visits/visit-document-presentation";

type Position = { latitude: number; longitude: number; accuracyM: number };

export function captureVisitPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite obtener ubicación"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyM: coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  });
}

const eventActionLabels = {
  linked: "vinculó",
  moved: "movió",
  inherited: "heredó",
} as const;

function statusBadgeClass(status: string): string {
  if (["APPROVED", "CONVERTED", "CONFIRMED", "DELIVERED"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (["REJECTED", "CANCELLED", "RETURNED"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200";
  }
  if (status === "PENDING_APPROVAL" || status === "INCOMPLETE") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  return "border-border bg-muted text-foreground";
}

function visitGpsDescription(visit: VisitDocumentHistory["visit"]) {
  if (visit.method === "manual") {
    return "sin GPS";
  }
  if (visit.latitude === null) {
    return "GPS eliminado a los 30 días";
  }
  return `GPS ±${Math.round(visit.accuracyM ?? 0)} m`;
}

function visitGpsLabel(visit: VisitDocumentHistory["visit"]): string {
  if (visit.method === "manual") {
    return "Sin GPS";
  }
  return visit.latitude === null ? "GPS eliminado" : "Con GPS";
}

function VisitLinkedDocuments({ history }: { history: VisitDocumentHistory }) {
  return (
    <section aria-label="Documentos vinculados" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Vinculados</h3>
        <Badge variant="secondary">{history.links.length}</Badge>
        {history.opportunities > 0 && (
          <span className="ml-auto text-muted-foreground text-xs">
            {history.opportunities}{" "}
            {history.opportunities === 1 ? "oportunidad" : "oportunidades"}
          </span>
        )}
      </div>
      {history.links.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay documentos vinculados.
        </p>
      ) : (
        <ul className="space-y-2">
          {history.links.map((link) => {
            const isQuote = link.type === "quote";
            const Icon = isQuote ? FileText : ClipboardList;
            return (
              <li
                className="flex min-w-0 items-start gap-3 rounded-xl border p-3"
                key={`${link.type}-${link.id}`}
              >
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                      {isQuote ? "Cotización" : "Preventa"}
                    </span>
                    <Badge
                      className={statusBadgeClass(link.status)}
                      variant="outline"
                    >
                      {visitDocumentStatusLabel(link.type, link.status)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {link.origin === "quote_conversion" &&
                      "De la cotización · "}
                    Vinculada el{" "}
                    {new Date(link.linkedAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function VisitRecordDetails({ history }: { history: VisitDocumentHistory }) {
  const visit = history.visit;
  return (
    <details className="group rounded-xl border px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <History aria-hidden="true" className="size-4 text-muted-foreground" />
        Detalles y actividad
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-2 pt-3 text-muted-foreground">
        <p>Ubicación registrada: {visitGpsDescription(visit)}</p>
        {visit.noDocumentsAtCheckin === true && (
          <p>
            Al confirmar la visita no había documentos. Se pudieron vincular
            después.
          </p>
        )}
        {visit.latitude !== null && visit.longitude !== null && (
          <a
            className="inline-flex items-center gap-1 text-primary underline"
            href={`https://www.openstreetmap.org/?mlat=${visit.latitude}&mlon=${visit.longitude}#map=17/${visit.latitude}/${visit.longitude}`}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            target="_blank"
          >
            <MapPin aria-hidden="true" className="size-4" />
            Ver ubicación de la visita
          </a>
        )}
        {visit.correctionReason && (
          <p>Registro observado: {visit.correctionReason}</p>
        )}
        {visit.skipReason && <p>Motivo sin visita: {visit.skipReason}</p>}
        {history.opportunities > 0 && (
          <p>
            Una cotización aprobada y su preventa cuentan como una sola
            oportunidad.
          </p>
        )}
        {history.events.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            <p className="font-medium text-foreground">Historial de vínculos</p>
            {history.events.map((event, index) => (
              <p key={`${event.createdAt}-${index}`}>
                {new Date(event.createdAt).toLocaleString("es-AR")} ·{" "}
                {eventActionLabels[event.action]} ·{" "}
                {event.type === "quote" ? "cotización" : "preventa"} ·{" "}
                {event.actorName ?? "Usuario no disponible"}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: combines GPS, candidate selection and visit-scoped history in one modal
export function VisitDocumentDialog({
  open,
  onOpenChange,
  orgSlug,
  visitId,
  customerName,
  siteName,
  visited,
  send,
  allowMove = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  visitId: string;
  customerName: string;
  siteName?: string | null;
  visited: boolean;
  allowMove?: boolean;
  send: (command: Record<string, unknown>) => Promise<boolean>;
}) {
  const [candidates, setCandidates] = useState<VisitDocumentCandidates | null>(
    null
  );
  const [history, setHistory] = useState<VisitDocumentHistory | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsFailure, setGpsFailure] = useState(false);
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const [manual, setManual] = useState(false);
  const [noDocuments, setNoDocuments] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<string[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/commercial-visits`;

  const locate = useCallback(async () => {
    locationRequest.current += 1;
    const request = locationRequest.current;
    setGpsFailure(false);
    setPosition(null);
    setLocating(true);
    try {
      const result = await captureVisitPosition();
      if (result.accuracyM > 1000) {
        throw new Error("La ubicación supera los 1000 m de precisión admitida");
      }
      if (request === locationRequest.current) {
        setPosition(result);
        setManual(false);
      }
    } catch {
      if (request === locationRequest.current) {
        setGpsFailure(true);
      }
    } finally {
      if (request === locationRequest.current) {
        setLocating(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCandidates(null);
    setHistory(null);
    setSelectedQuotes([]);
    setSelectedOrders([]);
    setNoDocuments(false);
    setManual(false);
    setPosition(null);
    setLoading(true);
    const controller = new AbortController();
    const load = async () => {
      const [candidateResponse, historyResponse] = await Promise.all([
        fetch(`${url}?view=candidates&visitId=${encodeURIComponent(visitId)}`, {
          signal: controller.signal,
          cache: "no-store",
        }),
        fetch(`${url}?view=history&visitId=${encodeURIComponent(visitId)}`, {
          signal: controller.signal,
          cache: "no-store",
        }),
      ]);
      const [candidateData, historyData] = await Promise.all([
        candidateResponse.json(),
        historyResponse.json(),
      ]);
      if (!(candidateResponse.ok && historyResponse.ok)) {
        throw new Error(
          candidateData.error ??
            historyData.error ??
            "No se pudieron cargar los documentos"
        );
      }
      if (!controller.signal.aborted) {
        setCandidates(visitDocumentCandidatesSchema.parse(candidateData));
        setHistory(visitDocumentHistorySchema.parse(historyData));
      }
    };
    load()
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Error al consultar documentos"
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    if (!visited) {
      locate();
    }
    return () => {
      controller.abort();
      locationRequest.current += 1;
    };
  }, [open, visitId, visited, url, locate]);

  function toggle(
    id: string,
    selected: string[],
    setter: (ids: string[]) => void
  ) {
    setter(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id]
    );
    setNoDocuments(false);
  }

  async function linkSelected() {
    for (const [type, ids] of [
      ["quote", selectedQuotes],
      ["pre_sale", selectedOrders],
    ] as const) {
      for (const id of ids) {
        if (
          !(await send({
            action: "linkDocument",
            visitId,
            documentType: type,
            documentId: id,
          }))
        ) {
          return false;
        }
      }
    }
    return true;
  }

  async function save() {
    setSaving(true);
    try {
      const saved = visited
        ? await linkSelected()
        : await send({
            action: "confirmVisit",
            visitId,
            manual,
            ...(manual ? {} : position),
            quoteIds: selectedQuotes,
            orderIds: selectedOrders,
            noDocuments,
          });
      if (!saved) {
        return;
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selectedQuotes.length + selectedOrders.length;
  const available = availableVisitDocuments(candidates, visitId, allowMove);
  const availableCount = available.quotes.length + available.orders.length;
  const disableSave =
    saving ||
    loading ||
    !candidates ||
    (!visited &&
      (!(manual || position) || (!noDocuments && selectedCount === 0))) ||
    (visited && selectedCount === 0);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg gap-4 p-4 sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>
            {visited ? "Documentos" : "Registrar visita"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {customerName}
            {(siteName ?? history?.visit.siteName) && (
              <span className="block">
                Sucursal: {siteName ?? history?.visit.siteName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {!visited && (
          <section className="space-y-3 rounded-xl border p-3 text-sm">
            <h3 className="flex items-center gap-2 font-semibold">
              <MapPin aria-hidden="true" className="size-4 text-primary" />
              Ubicación
            </h3>
            {position && !manual && (
              <p className="text-emerald-700 dark:text-emerald-300">
                GPS listo · ±{Math.round(position.accuracyM)} m
                {position.accuracyM > 100 && " · precisión baja"}
              </p>
            )}
            {!(position || manual) && (
              <p className="text-muted-foreground">
                {gpsFailure ? "No se pudo obtener GPS." : "Obteniendo GPS…"}
              </p>
            )}
            {manual && (
              <p className="text-amber-700 dark:text-amber-300">
                Sin GPS · registro excepcional
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                loading={locating}
                loadingText="Obteniendo GPS…"
                onClick={() => {
                  setManual(false);
                  locate();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Reintentar GPS
              </Button>
              <Button
                onClick={() => {
                  locationRequest.current += 1;
                  setLocating(false);
                  setManual(true);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Continuar sin GPS
              </Button>
            </div>
          </section>
        )}
        {visited && history && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-emerald-700 dark:text-emerald-300"
              />
              <span className="font-medium">Visita registrada</span>
              {history.visit.checkedInAt && (
                <span className="text-muted-foreground">
                  {new Date(history.visit.checkedInAt).toLocaleString("es-AR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <Badge className="ml-auto" variant="outline">
                {visitGpsLabel(history.visit)}
              </Badge>
            </div>
            <VisitLinkedDocuments history={history} />
          </>
        )}
        {visited && history && <VisitRecordDetails history={history} />}
        <section className="space-y-3 text-sm">
          {(availableCount > 0 || !visited) && (
            <h3 className="flex items-center gap-2 font-semibold">
              <Link2 aria-hidden="true" className="size-4 text-primary" />
              {visited ? "Para vincular" : "Documentos de esta visita"}
            </h3>
          )}
          {loading && (
            <p className="text-muted-foreground">Cargando documentos…</p>
          )}
          {candidates &&
            availableCount === 0 &&
            (visited ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-4 text-emerald-700 dark:text-emerald-300"
                />
                No quedan documentos para vincular.
              </p>
            ) : (
              <p className="text-muted-foreground">
                No hay documentos de hoy. Podés vincularlos después.
              </p>
            ))}
          {available.quotes.map((quote) => (
            <label
              className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedQuotes.includes(quote.id) ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              key={quote.id}
            >
              <input
                checked={selectedQuotes.includes(quote.id)}
                className="size-5 shrink-0 accent-primary"
                disabled={noDocuments}
                onChange={() =>
                  toggle(quote.id, selectedQuotes, setSelectedQuotes)
                }
                type="checkbox"
              />
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <FileText
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />{" "}
                  Cotización
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={statusBadgeClass(quote.status)}
                    variant="outline"
                  >
                    {visitDocumentStatusLabel("quote", quote.status)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {quote.total.toLocaleString("es-AR")}
                  </span>
                </div>
                {quote.linkedVisitId && (
                  <span className="block text-amber-700 text-xs dark:text-amber-300">
                    Se moverá desde otra visita
                  </span>
                )}
              </div>
            </label>
          ))}
          {available.orders.map((order) => (
            <label
              className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedOrders.includes(order.id) ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              key={order.id}
            >
              <input
                checked={selectedOrders.includes(order.id)}
                className="size-5 shrink-0 accent-primary"
                disabled={noDocuments}
                onChange={() =>
                  toggle(order.id, selectedOrders, setSelectedOrders)
                }
                type="checkbox"
              />
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <ClipboardList
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />{" "}
                  Preventa
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={statusBadgeClass(order.status)}
                    variant="outline"
                  >
                    {visitDocumentStatusLabel("pre_sale", order.status)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {order.total.toLocaleString("es-AR")}
                  </span>
                </div>
                {order.linkedVisitId && (
                  <span className="block text-amber-700 text-xs dark:text-amber-300">
                    Se moverá desde otra visita
                  </span>
                )}
              </div>
            </label>
          ))}
          {!visited && (
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3">
              <input
                checked={noDocuments}
                className="size-5 shrink-0 accent-primary"
                onChange={(event) => {
                  setNoDocuments(event.target.checked);
                  if (event.target.checked) {
                    setSelectedQuotes([]);
                    setSelectedOrders([]);
                  }
                }}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">No hubo documentos</span>
                <span className="text-muted-foreground text-xs">
                  Podés vincularlos después.
                </span>
              </span>
            </label>
          )}
        </section>
        <DialogFooter className="pt-1">
          {visited && candidates && availableCount === 0 ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Listo
            </Button>
          ) : (
            <Button
              className="w-full sm:w-auto"
              disabled={disableSave}
              loading={saving}
              loadingText={visited ? "Vinculando…" : "Guardando visita…"}
              onClick={save}
              type="button"
            >
              {visited ? (
                <>
                  <Link2 aria-hidden="true" className="mr-2 size-4" /> Vincular
                  {selectedCount > 0 ? ` (${selectedCount})` : ""}
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" className="mr-2 size-4" />{" "}
                  Confirmar visita
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
