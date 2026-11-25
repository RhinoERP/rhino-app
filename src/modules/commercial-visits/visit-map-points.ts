import type { CustomerSite, RouteDayResult } from "./contracts";

export type VisitMapPoint = {
  siteId: string;
  customerName: string;
  siteName: string;
  address: string;
  latitude: number;
  longitude: number;
  status: "other" | "planned" | "visited";
};

/** Only map approved, active sites of customers visible in the route selector. */
export function getVisitMapPoints(
  day: RouteDayResult,
  sites: CustomerSite[]
): VisitMapPoint[] {
  const customers = new Map(
    day.customers.map((customer) => [customer.id, customer.name])
  );
  const statuses = new Map<string, "planned" | "visited">();
  for (const route of day.routes) {
    for (const visit of route.visits) {
      if (!visit.siteId) {
        continue;
      }
      const status = visit.checkedInAt ? "visited" : "planned";
      if (status === "visited" || !statuses.has(visit.siteId)) {
        statuses.set(visit.siteId, status);
      }
    }
  }

  return sites.flatMap((site) => {
    const customerName = customers.get(site.customerId);
    if (
      !(customerName && site.active) ||
      site.latitude === null ||
      site.longitude === null
    ) {
      return [];
    }
    return [
      {
        siteId: site.id,
        customerName,
        siteName: site.name,
        address: [site.address, site.city].filter(Boolean).join(", "),
        latitude: site.latitude,
        longitude: site.longitude,
        status: statuses.get(site.id) ?? "other",
      },
    ];
  });
}
