import type { DivIcon } from "leaflet";

/** A teardrop marker anchored at its tip, so the pin points to the exact coordinate. */
export function mapPinIcon(
  L: typeof import("leaflet"),
  color: string
): DivIcon {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true" style="filter:drop-shadow(0 2px 3px #0005)">
      <path d="M18 2C9.2 2 2 9.2 2 18c0 10.8 16 24 16 24s16-13.2 16-24C34 9.2 26.8 2 18 2Z" fill="${color}" stroke="white" stroke-width="2.5"/>
      <circle cx="18" cy="18" r="6" fill="white"/>
    </svg>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
  });
}
