import { describe, expect, it, vi } from "vitest";
import { mapPinIcon } from "./map-pin-icon";

describe("map pin icon", () => {
  it("anchors the pin tip to the exact coordinate and keeps its status color", () => {
    const divIcon = vi.fn((options) => options);
    const icon = mapPinIcon(
      { divIcon } as unknown as typeof import("leaflet"),
      "#16a34a"
    );

    expect(icon).toEqual(
      expect.objectContaining({
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
        html: expect.stringContaining('fill="#16a34a"'),
      })
    );
  });
});
