"use client";

import { MapPinIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VISIT_RESULTS } from "@/modules/commercial-ai/constants";
import type {
  CheckinLocation,
  VisitResult,
} from "@/modules/commercial-ai/types";

const LOCATION_TIMEOUT_MS = 12_000;
const MAX_LOCATION_AGE_MS = 30_000;
const METERS_PER_DEGREE = 111_320;
const EARTH_RADIUS_M = 6_371_000;

const GEO_ERRORS: Record<number, string> = {
  1: "Permiso de ubicación negado",
  2: "El celular no pudo obtener la ubicación",
  3: "La ubicación tardó demasiado",
};

/** Pide la ubicación al celular. Nunca falla: si no puede, devuelve el motivo. */
export function captureLocation(): Promise<CheckinLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      error: "Este dispositivo no tiene GPS disponible",
    });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
          capturedAt: new Date(position.timestamp).toISOString(),
        }),
      (error) => resolve({ error: GEO_ERRORS[error.code] ?? "Sin ubicación" }),
      {
        enableHighAccuracy: true,
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: MAX_LOCATION_AGE_MS,
      }
    );
  });
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function googleMapsPointUrl(
  latitude: number,
  longitude: number
): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Mapa de OpenStreetMap con un marcador (gratis y sin clave). */
export function OsmMap({
  latitude,
  longitude,
  title,
}: {
  latitude: number;
  longitude: number;
  title: string;
}) {
  const span = 300 / METERS_PER_DEGREE;
  const bbox = [
    longitude - span,
    latitude - span,
    longitude + span,
    latitude + span,
  ]
    .map((v) => v.toFixed(6))
    .join(",");
  return (
    <iframe
      className="h-56 w-full rounded-md border"
      loading="lazy"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`}
      title={title}
    />
  );
}

export function describeLocationResult(location: CheckinLocation): void {
  if ("error" in location) {
    toast.warning(`Se guardó sin ubicación: ${location.error}.`);
  }
}

/** Botones de resultado + nota. Toma la ubicación antes de guardar. */
export function VisitResultPicker({
  onSave,
  hint,
}: {
  onSave: (
    result: VisitResult,
    note: string,
    location: CheckinLocation
  ) => Promise<{ success: boolean; error?: string }>;
  hint?: string;
}) {
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || locating;

  const save = (result: VisitResult) =>
    startTransition(async () => {
      setLocating(true);
      const location = await captureLocation();
      setLocating(false);
      const response = await onSave(result, note, location);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Visita registrada.");
      describeLocationResult(location);
      setNote("");
    });

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <p className="flex items-center gap-1.5 font-medium text-sm">
        <MapPinIcon className="size-4 text-primary" weight="duotone" />
        ¿Cómo salió?
        <span className="font-normal text-muted-foreground text-xs">
          · se guarda dónde estás
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(VISIT_RESULTS) as VisitResult[]).map((result) => (
          <Button
            disabled={busy}
            key={result}
            onClick={() => save(result)}
            size="sm"
            variant="outline"
          >
            {VISIT_RESULTS[result].label}
          </Button>
        ))}
      </div>
      {locating ? (
        <p className="text-muted-foreground text-xs">Tomando tu ubicación…</p>
      ) : null}
      <Textarea
        aria-label="Nota de la visita"
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota opcional (escribila antes de tocar el resultado)"
        rows={2}
        value={note}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
