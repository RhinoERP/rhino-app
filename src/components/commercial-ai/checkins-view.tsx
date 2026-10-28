"use client";

import {
  ArrowLeftIcon,
  MapPinIcon,
  MapTrifoldIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VISIT_RESULTS } from "@/modules/commercial-ai/constants";
import type { CheckinView } from "@/modules/commercial-ai/types";
import { SellerChip, useCommercialAi } from "./shared";
import { distanceMeters, googleMapsPointUrl, OsmMap } from "./visit-location";

const ALL = "todos";
/** Más lejos que esto de donde suele registrarse esa cuenta, lo marcamos. */
const FAR_FROM_USUAL_M = 300;
const MIN_PREVIOUS_FOR_COMPARISON = 2;
const POOR_ACCURACY_M = 100;
const MAX_MAP_WAYPOINTS = 9;

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

function hasPosition(
  checkin: CheckinView
): checkin is CheckinView & { latitude: number; longitude: number } {
  return checkin.latitude !== null && checkin.longitude !== null;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Compara cada registro con los anteriores de la misma cuenta: si quedó lejos
 * de donde se suele registrar, puede que la visita no se haya hecho en el local.
 */
function farFromUsual(checkins: CheckinView[]): Map<string, number> {
  const flagged = new Map<string, number>();
  const byAccount = new Map<string, CheckinView[]>();
  for (const checkin of [...checkins].reverse()) {
    if (!hasPosition(checkin)) {
      continue;
    }
    const previous = byAccount.get(checkin.accountId) ?? [];
    if (previous.length >= MIN_PREVIOUS_FOR_COMPARISON) {
      const usual = {
        latitude: medianOf(previous.map((p) => p.latitude as number)),
        longitude: medianOf(previous.map((p) => p.longitude as number)),
      };
      const distance = distanceMeters(checkin, usual);
      if (distance > FAR_FROM_USUAL_M) {
        flagged.set(checkin.id, Math.round(distance));
      }
    }
    previous.push(checkin);
    byAccount.set(checkin.accountId, previous);
  }
  return flagged;
}

function dayRouteUrl(points: CheckinView[]): string | null {
  const located = points.filter(hasPosition);
  if (located.length === 0) {
    return null;
  }
  const format = (c: CheckinView) => `${c.latitude},${c.longitude}`;
  const params = new URLSearchParams({
    api: "1",
    origin: format(located[0]),
    destination: format(located.at(-1) ?? located[0]),
    travelmode: "driving",
  });
  const middle = located.slice(1, -1).slice(0, MAX_MAP_WAYPOINTS);
  if (middle.length) {
    params.set("waypoints", middle.map(format).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Línea corta con la ubicación de un registro (dentro de una parada de ruta). */
export function CheckinLocationLine({
  checkin,
}: {
  checkin: CheckinView | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!checkin) {
    return null;
  }
  if (!hasPosition(checkin)) {
    return (
      <p className="flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
        <WarningIcon className="size-3.5" />
        Registrado a las {timeOf(checkin.createdAt)} sin ubicación (
        {checkin.locationError ?? "sin GPS"})
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
        <MapPinIcon className="size-3.5 text-primary" weight="duotone" />
        Registrado a las {timeOf(checkin.createdAt)}
        {checkin.accuracyM !== null
          ? ` · precisión ${Math.round(checkin.accuracyM)} m`
          : ""}
        <button
          className="font-medium text-primary hover:underline"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? "Ocultar mapa" : "Ver dónde"}
        </button>
      </p>
      {open ? (
        <OsmMap
          latitude={checkin.latitude}
          longitude={checkin.longitude}
          title={`Ubicación del registro en ${checkin.accountName}`}
        />
      ) : null}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cada registro muestra ubicación, resultado y alertas
function CheckinRow({
  checkin,
  index,
  far,
  showMap,
  onOpenAccount,
  onToggleMap,
}: {
  checkin: CheckinView;
  index: number;
  far: number | undefined;
  showMap: boolean;
  onOpenAccount: () => void;
  onToggleMap: () => void;
}) {
  const poor =
    checkin.accuracyM !== null && checkin.accuracyM > POOR_ACCURACY_M;
  return (
    <div className="border-t px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-primary font-semibold text-xs">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm tabular-nums">
              {timeOf(checkin.createdAt)}
            </span>
            <button
              className="font-medium hover:underline"
              onClick={onOpenAccount}
              type="button"
            >
              {checkin.accountName}
            </button>
            <span className="text-muted-foreground text-xs">
              {checkin.kind === "cliente" ? "Cliente" : "Prospecto"}
              {checkin.accountCity ? ` · ${checkin.accountCity}` : ""}
              {checkin.routeId ? " · en ruta" : " · visita suelta"}
            </span>
            {checkin.result ? (
              <Badge
                className={cn(
                  "border-transparent",
                  VISIT_RESULTS[checkin.result].className
                )}
              >
                {VISIT_RESULTS[checkin.result].label}
              </Badge>
            ) : null}
          </p>
          {checkin.note ? <p className="text-sm">“{checkin.note}”</p> : null}
          {hasPosition(checkin) ? (
            <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
              <MapPinIcon className="size-3.5 text-primary" weight="duotone" />
              {checkin.latitude.toFixed(5)}, {checkin.longitude.toFixed(5)}
              {checkin.accuracyM !== null
                ? ` · precisión ${Math.round(checkin.accuracyM)} m`
                : ""}
              <a
                className="font-medium text-primary hover:underline"
                href={googleMapsPointUrl(checkin.latitude, checkin.longitude)}
                rel="noopener noreferrer"
                target="_blank"
              >
                Abrir en Google Maps
              </a>
              <button
                className="font-medium text-primary hover:underline"
                onClick={onToggleMap}
                type="button"
              >
                {showMap ? "Ocultar mapa" : "Ver mapa"}
              </button>
            </p>
          ) : (
            <p className="flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
              <WarningIcon className="size-3.5" />
              Sin ubicación: {checkin.locationError ?? "el celular no la envió"}
            </p>
          )}
          {far ? (
            <p className="flex items-center gap-1 text-destructive text-xs">
              <WarningIcon className="size-3.5" />A {far} m de donde se suele
              registrar esta cuenta
            </p>
          ) : null}
          {poor ? (
            <p className="text-muted-foreground text-xs">
              GPS poco preciso en este registro.
            </p>
          ) : null}
        </div>
      </div>
      {showMap && hasPosition(checkin) ? (
        <div className="mt-2">
          <OsmMap
            latitude={checkin.latitude}
            longitude={checkin.longitude}
            title={`Registro en ${checkin.accountName}`}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Todos los registros con ubicación: el gerente ve a todo el equipo, el vendedor los suyos. */
export function CheckinsView({ onBack }: { onBack: () => void }) {
  const { snapshot, isManager, openCustomer, openProspect } = useCommercialAi();
  const [day, setDay] = useState(snapshot.today);
  const [seller, setSeller] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const { checkins } = snapshot.prospecting;

  const flagged = useMemo(() => farFromUsual(checkins), [checkins]);
  const visible = checkins.filter(
    (c) =>
      (!day || dayOf(c.createdAt) === day) &&
      (seller === ALL || c.userId === seller)
  );
  // Recorrido en orden cronológico, por vendedor.
  const bySeller = new Map<string, CheckinView[]>();
  for (const checkin of [...visible].reverse()) {
    const key = checkin.userId ?? "sin-usuario";
    bySeller.set(key, [...(bySeller.get(key) ?? []), checkin]);
  }
  const withoutLocation = visible.filter((c) => !hasPosition(c)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Volver"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="font-heading text-xl">
          {isManager ? "Registros con ubicación" : "Mis registros"}
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Input
            aria-label="Día"
            className="w-44"
            onChange={(e) => setDay(e.target.value)}
            type="date"
            value={day}
          />
          {isManager ? (
            <Select onValueChange={setSeller} value={seller}>
              <SelectTrigger aria-label="Vendedor" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todo el equipo</SelectItem>
                {[
                  ...new Map(
                    checkins.map((c) => [c.userId, c.userName])
                  ).entries(),
                ]
                  .filter(([id]) => id)
                  .map(([id, name]) => (
                    <SelectItem key={id as string} value={id as string}>
                      {name ?? "Usuario"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Cada vez que alguien registra una visita (en una ruta o desde la ficha
        del cliente o prospecto), guardamos dónde estaba el celular, la hora y
        la precisión del GPS.
        {withoutLocation
          ? ` ${withoutLocation} registros de este día no tienen ubicación.`
          : ""}
      </p>

      {[...bySeller.entries()].map(([userId, list]) => {
        const routeUrl = dayRouteUrl(list);
        return (
          <Card className="gap-0 overflow-hidden py-0" key={userId}>
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
              {isManager ? <SellerChip sellerId={userId} /> : null}
              <span className="font-semibold">
                {list[0]?.userName ?? "Usuario"}
              </span>
              <span className="text-muted-foreground text-sm">
                {list.length} registros · {timeOf(list[0].createdAt)} a{" "}
                {timeOf(list.at(-1)?.createdAt ?? list[0].createdAt)}
              </span>
              {routeUrl ? (
                <Button asChild className="ml-auto" size="sm" variant="outline">
                  <a href={routeUrl} rel="noopener noreferrer" target="_blank">
                    <MapTrifoldIcon />
                    Recorrido del día
                  </a>
                </Button>
              ) : null}
            </div>
            {list.map((checkin, index) => (
              <CheckinRow
                checkin={checkin}
                far={flagged.get(checkin.id)}
                index={index}
                key={checkin.id}
                onOpenAccount={() =>
                  checkin.kind === "cliente"
                    ? openCustomer(checkin.accountId)
                    : openProspect(checkin.accountId)
                }
                onToggleMap={() =>
                  setOpenId(openId === checkin.id ? null : checkin.id)
                }
                showMap={openId === checkin.id}
              />
            ))}
          </Card>
        );
      })}

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          No hay registros para este día. Se generan al tocar un resultado
          (Pedido, Interesado, No estaba…) en una parada o en “Registrar
          visita”.
        </Card>
      ) : null}
    </div>
  );
}
