"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { captureVisitPosition } from "./visit-document-dialog";

const ZOOM = 15;
const TILE_SIZE = 256;
const CENTER = { latitude: -34.6037, longitude: -58.3816 };

function toWorld(latitude: number, longitude: number) {
  const scale = TILE_SIZE * 2 ** ZOOM;
  const clamped = Math.max(-85.0511, Math.min(85.0511, latitude));
  const radians = (clamped * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
        2) *
      scale,
  };
}

function fromWorld(x: number, y: number) {
  const scale = TILE_SIZE * 2 ** ZOOM;
  return {
    latitude:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI,
    longitude: (x / scale) * 360 - 180,
  };
}

function PinMap({
  center,
  selected,
  onSelect,
}: {
  center: typeof CENTER;
  selected: typeof CENTER | null;
  onSelect: (point: typeof CENTER) => void;
}) {
  const world = toWorld(center.latitude, center.longitude);
  const marker = selected
    ? toWorld(selected.latitude, selected.longitude)
    : null;
  const tileX = Math.floor(world.x / TILE_SIZE);
  const tileY = Math.floor(world.y / TILE_SIZE);
  const tiles = [-1, 0, 1].flatMap((dy) =>
    [-1, 0, 1].map((dx) => ({ x: tileX + dx, y: tileY + dy }))
  );
  return (
    <div className="relative mx-auto h-64 w-full max-w-80 overflow-hidden rounded-md border">
      {tiles
        .filter(({ y }) => y >= 0 && y < 2 ** ZOOM)
        .map(({ x, y }) => (
          // biome-ignore lint/performance/noImgElement: external OSM tiles are not application assets
          <img
            alt=""
            draggable={false}
            height={TILE_SIZE}
            key={`${x}-${y}`}
            src={`https://tile.openstreetmap.org/${ZOOM}/${(x + 2 ** ZOOM) % 2 ** ZOOM}/${y}.png`}
            style={{
              position: "absolute",
              left: `calc(50% + ${x * TILE_SIZE - world.x}px)`,
              top: y * TILE_SIZE - world.y + 128,
              pointerEvents: "none",
            }}
            width={TILE_SIZE}
          />
        ))}
      <button
        aria-label="Colocar pin en el mapa; con teclado se elige el centro"
        className="absolute inset-0 z-10 cursor-crosshair"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const atCenter = event.detail === 0;
          onSelect(
            fromWorld(
              world.x +
                (atCenter ? 0 : event.clientX - rect.left - rect.width / 2),
              world.y +
                (atCenter ? 0 : event.clientY - rect.top - rect.height / 2)
            )
          );
        }}
        type="button"
      />
      {marker && (
        <span
          className="-translate-x-1/2 -translate-y-full pointer-events-none absolute z-20 text-3xl"
          style={{
            left: `calc(50% + ${marker.x - world.x}px)`,
            top: marker.y - world.y + 128,
          }}
        >
          📍
        </span>
      )}
      <span className="absolute right-0 bottom-0 z-20 bg-background/90 px-1 text-[10px]">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          onClick={(event) => event.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          OpenStreetMap
        </a>
      </span>
    </div>
  );
}

export function VisitPointDialog({
  open,
  onOpenChange,
  customerName,
  siteName,
  visitId,
  send,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  siteName: string;
  visitId: string;
  send: (command: Record<string, unknown>) => Promise<boolean>;
}) {
  const [method, setMethod] = useState<"gps" | "pin">("gps");
  const [point, setPoint] = useState<typeof CENTER | null>(null);
  const [center, setCenter] = useState(CENTER);
  const [referenceLat, setReferenceLat] = useState(String(CENTER.latitude));
  const [referenceLng, setReferenceLng] = useState(String(CENTER.longitude));
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);

  async function locate(selectPoint = true) {
    locationRequest.current += 1;
    const request = locationRequest.current;
    setLocating(true);
    try {
      const position = await captureVisitPosition();
      if (request !== locationRequest.current) {
        return;
      }
      setCenter({ latitude: position.latitude, longitude: position.longitude });
      setReferenceLat(String(position.latitude));
      setReferenceLng(String(position.longitude));
      if (selectPoint) {
        setPoint({
          latitude: position.latitude,
          longitude: position.longitude,
        });
      }
      setAccuracy(position.accuracyM);
    } catch {
      if (request === locationRequest.current) {
        toast.error(
          "No se pudo obtener GPS. Podés seleccionar un pin manualmente."
        );
      }
    } finally {
      if (request === locationRequest.current) {
        setLocating(false);
      }
    }
  }

  async function propose() {
    if (!point) {
      return;
    }
    setSaving(true);
    try {
      const saved = await send({
        action: "proposeLocation",
        visitId,
        method,
        latitude: point.latitude,
        longitude: point.longitude,
        ...(method === "gps" ? { accuracyM: accuracy } : {}),
        ...(address.trim() && city.trim()
          ? { address: address.trim(), city: city.trim() }
          : {}),
      });
      if (saved) {
        locationRequest.current += 1;
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          locationRequest.current += 1;
          setLocating(false);
          setPoint(null);
          setAccuracy(null);
          setMethod("gps");
          setAddress("");
          setCity("");
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proponer ubicación de sucursal</DialogTitle>
          <DialogDescription>
            {customerName} · {siteName}. El punto vigente no cambia hasta que lo
            apruebe el administrador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            loading={locating && method === "gps"}
            loadingText="Obteniendo GPS…"
            onClick={() => {
              setMethod("gps");
              setPoint(null);
              locate();
            }}
            type="button"
            variant={method === "gps" ? "default" : "outline"}
          >
            Usar mi GPS
          </Button>
          <Button
            onClick={() => {
              locationRequest.current += 1;
              setLocating(false);
              setMethod("pin");
              setPoint(null);
              setAccuracy(null);
            }}
            type="button"
            variant={method === "pin" ? "default" : "outline"}
          >
            Colocar pin
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Si la sucursal se mudó, ingresá también su nueva dirección y ciudad.
        </p>
        <input
          aria-label="Nueva dirección (opcional)"
          className="w-full rounded-md border p-2"
          maxLength={500}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Nueva dirección (opcional)"
          value={address}
        />
        <input
          aria-label="Nueva ciudad (opcional)"
          className="w-full rounded-md border p-2"
          maxLength={120}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Nueva ciudad (opcional)"
          value={city}
        />
        {method === "pin" && (
          <>
            <p className="text-muted-foreground text-sm">
              Tocá el mapa para colocar el pin. Podés centrarlo cerca de tu
              ubicación o ingresar coordenadas para buscar otra zona.
            </p>
            <Button
              loading={locating && method === "pin"}
              loadingText="Obteniendo GPS…"
              onClick={() => locate(false)}
              type="button"
              variant="outline"
            >
              Centrar cerca de mí
            </Button>
            <div className="flex gap-2">
              <input
                aria-label="Latitud de referencia"
                className="w-1/2 rounded-md border p-2"
                onChange={(event) => setReferenceLat(event.target.value)}
                type="text"
                value={referenceLat}
              />
              <input
                aria-label="Longitud de referencia"
                className="w-1/2 rounded-md border p-2"
                onChange={(event) => setReferenceLng(event.target.value)}
                type="text"
                value={referenceLng}
              />
            </div>
            <Button
              onClick={() => {
                const latitude = Number(referenceLat);
                const longitude = Number(referenceLng);
                if (
                  !(Number.isFinite(latitude) && Number.isFinite(longitude)) ||
                  Math.abs(latitude) > 85 ||
                  Math.abs(longitude) > 180 ||
                  !referenceLat.trim() ||
                  !referenceLng.trim()
                ) {
                  toast.error(
                    "Ingresá coordenadas válidas para centrar el mapa"
                  );
                  return;
                }
                setCenter({ latitude, longitude });
                setPoint(null);
              }}
              type="button"
              variant="outline"
            >
              Ir a coordenadas
            </Button>
            {Number.isFinite(center.latitude) &&
              Number.isFinite(center.longitude) &&
              Math.abs(center.latitude) <= 85 &&
              Math.abs(center.longitude) <= 180 && (
                <PinMap center={center} onSelect={setPoint} selected={point} />
              )}
          </>
        )}
        {point && (
          <p className="text-sm">
            Punto propuesto: {point.latitude.toFixed(6)},{" "}
            {point.longitude.toFixed(6)}
            {method === "gps" &&
              accuracy !== null &&
              ` · ±${Math.round(accuracy)} m`}
          </p>
        )}
        <DialogFooter>
          <Button
            disabled={
              saving ||
              locating ||
              !point ||
              Boolean(address.trim()) !== Boolean(city.trim()) ||
              (method === "gps" && (accuracy === null || accuracy > 1000))
            }
            loading={saving}
            loadingText="Enviando propuesta…"
            onClick={propose}
            type="button"
          >
            Enviar a aprobación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
