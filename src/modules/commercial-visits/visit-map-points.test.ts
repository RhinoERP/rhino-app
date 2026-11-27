import { describe, expect, it } from "vitest";
import type { CustomerSite, RouteDayResult } from "./contracts";
import { getVisitMapPoints } from "./visit-map-points";

const customer = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const sites: CustomerSite[] = [
  {
    id: "main",
    customerId: customer,
    name: "Principal",
    address: "Calle 1",
    city: "Rosario",
    notes: null,
    active: true,
    latitude: -32.95,
    longitude: -60.66,
  },
  {
    id: "branch",
    customerId: customer,
    name: "Sucursal",
    address: "Calle 2",
    city: "Rosario",
    notes: null,
    active: true,
    latitude: -32.96,
    longitude: -60.65,
  },
  {
    id: "unknown",
    customerId: other,
    name: "Ajeno",
    address: "",
    city: "",
    notes: null,
    active: true,
    latitude: -32,
    longitude: -60,
  },
  {
    id: "unlocated",
    customerId: customer,
    name: "Sin aprobar",
    address: "",
    city: "",
    notes: null,
    active: true,
    latitude: null,
    longitude: null,
  },
];

const day: RouteDayResult = {
  customers: [{ id: customer, name: "Cliente", sites: [] }],
  routes: [],
};

function route(visits: RouteDayResult["routes"][number]["visits"]) {
  return {
    id: customer,
    number: 1,
    status: "open" as const,
    closedAt: null,
    visits,
    events: [],
  };
}

function visit(siteId: string, checkedInAt: string | null) {
  return {
    id: customer,
    customerId: customer,
    customerName: "Cliente",
    checkedInAt,
    method: null,
    reviewStatus: "not_visited" as const,
    hasLocation: true,
    siteId,
    siteName: "Sucursal",
    siteAddress: null,
    plannedPosition: 1,
    skipReason: null,
    correctedAt: null,
    correctionReason: null,
    hasPendingLocation: false,
  };
}

describe("visit map points", () => {
  it("only includes approved active sites of customers in the route selector", () => {
    expect(getVisitMapPoints(day, sites).map((point) => point.siteId)).toEqual([
      "main",
      "branch",
    ]);
    expect(getVisitMapPoints(day, sites)[0].status).toBe("other");
  });

  it("highlights planned visits and updates their status after check-in", () => {
    const planned = { ...day, routes: [route([visit("branch", null)])] };
    expect(
      getVisitMapPoints(planned, sites).map((point) => point.status)
    ).toEqual(["other", "planned"]);
    const visited = {
      ...day,
      routes: [route([visit("branch", "2026-11-25T15:00:00Z")])],
    };
    expect(getVisitMapPoints(visited, sites)[1].status).toBe("visited");
  });

  it("does not show inactive sites even when scheduled", () => {
    const planned = { ...day, routes: [route([visit("branch", null)])] };
    expect(
      getVisitMapPoints(
        planned,
        sites.map((site) =>
          site.id === "branch" ? { ...site, active: false } : site
        )
      ).map((point) => point.siteId)
    ).toEqual(["main"]);
  });
});
