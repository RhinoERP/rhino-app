"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { mapPinIcon } from "@/components/map/map-pin-icon";
import type { VisitMapPoint } from "@/modules/commercial-visits/visit-map-points";

const colors = {
  other: "#64748b",
  planned: "#2563eb",
  visited: "#16a34a",
};

function addPointMarker(
  L: typeof import("leaflet"),
  layer: import("leaflet").LayerGroup,
  point: VisitMapPoint
) {
  const marker = L.marker([point.latitude, point.longitude], {
    icon: mapPinIcon(L, colors[point.status]),
    title: `${point.customerName} · ${point.siteName}`,
  });
  const popup = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${point.customerName} · ${point.siteName}`;
  popup.append(title);
  if (point.address) {
    const address = document.createElement("div");
    address.textContent = point.address;
    popup.append(address);
  }
  const status = document.createElement("div");
  status.textContent = {
    other: "Sin visita programada",
    planned: "Programado",
    visited: "Visitado",
  }[point.status];
  popup.append(status);
  marker.bindPopup(popup).addTo(layer);
}

export function VisitMap({ points }: { points: VisitMapPoint[] }) {
  const hasPoints = points.length > 0;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const markers = useRef<import("leaflet").LayerGroup | null>(null);
  const fitted = useRef(false);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    if (!hasPoints) {
      return;
    }
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !container.current) {
        return;
      }
      const instance = L.map(container.current, {
        scrollWheelZoom: false,
      }).setView([-34.6037, -58.3816], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(instance);
      map.current = instance;
      markers.current = L.layerGroup().addTo(instance);
      setLeaflet(L);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current = null;
      fitted.current = false;
    };
  }, [hasPoints]);

  useEffect(() => {
    const instance = map.current;
    const layer = markers.current;
    if (!(leaflet && instance && layer)) {
      return;
    }
    layer.clearLayers();
    for (const point of points) {
      addPointMarker(leaflet, layer, point);
    }
    if (!fitted.current && points.length > 0) {
      instance.fitBounds(
        leaflet.latLngBounds(
          points.map((point) => [point.latitude, point.longitude])
        ),
        { padding: [24, 24], maxZoom: 15 }
      );
      fitted.current = true;
    }
  }, [leaflet, points]);

  const planned = points.filter((point) => point.status === "planned").length;
  const visited = points.filter((point) => point.status === "visited").length;

  return (
    <section aria-label="Mapa de visitas" className="space-y-3">
      <div>
        <h2 className="font-semibold text-lg">Mapa de visitas</h2>
        <p className="text-muted-foreground text-sm">
          {points.length} puntos aprobados · {planned} programados · {visited}{" "}
          visitados
        </p>
      </div>
      {hasPoints ? (
        <div
          aria-label="Mapa de puntos aprobados de clientes"
          className="relative z-0 h-[360px] w-full overflow-hidden rounded-xl border bg-muted sm:h-[430px]"
          ref={container}
          role="img"
        />
      ) : (
        <p className="rounded-xl border p-4 text-muted-foreground text-sm">
          No hay puntos aprobados de tus clientes para mostrar en el mapa.
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <span aria-hidden="true" className="text-slate-500">
            ●
          </span>{" "}
          Sin programar
        </span>
        <span>
          <span aria-hidden="true" className="text-blue-600">
            ●
          </span>{" "}
          Programado
        </span>
        <span>
          <span aria-hidden="true" className="text-green-600">
            ●
          </span>{" "}
          Visitado
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Tocá un punto para ver el cliente y la sucursal. El mapa base requiere
        conexión. Búsqueda de direcciones:{" "}
        <a
          className="underline"
          href="https://www.geoapify.com/"
          rel="noopener noreferrer"
          target="_blank"
        >
          Geoapify
        </a>
        .
      </p>
    </section>
  );
}
