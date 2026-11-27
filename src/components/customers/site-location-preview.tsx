"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { mapPinIcon } from "@/components/map/map-pin-icon";

export type MapPosition = { latitude: number; longitude: number };

/** The marker is only a draft; it never writes to the customer site. */
export function SiteLocationPreview({
  initial,
  onChange,
}: {
  initial: MapPosition;
  onChange: (point: MapPosition) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    import("leaflet").then((L) => {
      if (cancelled || !container.current) {
        return;
      }
      map = L.map(container.current).setView(
        [initial.latitude, initial.longitude],
        17
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([initial.latitude, initial.longitude], {
        draggable: true,
        icon: mapPinIcon(L, "#2563eb"),
        title: "Arrastrá para ajustar el punto",
      }).addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        marker.setLatLng(event.latlng);
        onChangeRef.current({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      });
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        onChangeRef.current({
          latitude: position.lat,
          longitude: position.lng,
        });
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [initial]);

  return (
    <div
      aria-label="Vista previa del punto; tocá el mapa o arrastrá el marcador para corregirlo"
      className="relative z-0 h-56 w-full overflow-hidden rounded-md border bg-muted"
      ref={container}
      role="application"
    />
  );
}
