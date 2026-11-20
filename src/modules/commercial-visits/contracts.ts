import { z } from "zod";

export const visitDaySchema = z.iso.date();
export const visitCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createRoute"), day: visitDaySchema }),
  z.object({
    action: z.literal("addToRoute"),
    routeId: z.uuid(),
    customerId: z.uuid(),
    siteId: z.uuid(),
  }),
  z.object({
    action: z.literal("reorder"),
    routeId: z.uuid(),
    visitIds: z.array(z.uuid()),
  }),
  z.object({
    action: z.literal("closeRoute"),
    routeId: z.uuid(),
    reasons: z.record(z.uuid(), z.string().trim().min(1).max(1000)),
  }),
  z.object({ action: z.literal("reopenRoute"), routeId: z.uuid() }),
  z.object({
    action: z.literal("correctVisit"),
    visitId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal("add"),
    customerId: z.uuid(),
    day: visitDaySchema,
  }),
  z
    .object({
      action: z.literal("confirmVisit"),
      visitId: z.uuid(),
      manual: z.boolean(),
      latitude: z.number().finite().min(-90).max(90).optional(),
      longitude: z.number().finite().min(-180).max(180).optional(),
      accuracyM: z.number().finite().min(0).max(1000).optional(),
      quoteIds: z.array(z.uuid()).max(100),
      orderIds: z.array(z.uuid()).max(100),
      noDocuments: z.boolean(),
    })
    .refine(
      (value) =>
        (value.manual
          ? value.latitude === undefined &&
            value.longitude === undefined &&
            value.accuracyM === undefined
          : value.latitude !== undefined &&
            value.longitude !== undefined &&
            value.accuracyM !== undefined) &&
        new Set(value.quoteIds).size === value.quoteIds.length &&
        new Set(value.orderIds).size === value.orderIds.length &&
        (value.noDocuments
          ? value.quoteIds.length + value.orderIds.length === 0
          : value.quoteIds.length + value.orderIds.length > 0),
      "Se requiere GPS o confirmación manual"
    ),
  z.object({
    action: z.literal("linkDocument"),
    visitId: z.uuid(),
    documentType: z.enum(["quote", "pre_sale"]),
    documentId: z.uuid(),
  }),
  z
    .object({
      action: z.literal("proposeLocation"),
      visitId: z.uuid(),
      method: z.enum(["gps", "pin"]),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      accuracyM: z.number().finite().min(0).max(1000).optional(),
      address: z.string().trim().min(1).max(500).optional(),
      city: z.string().trim().min(1).max(120).optional(),
    })
    .refine((value) =>
      value.method === "gps"
        ? value.accuracyM !== undefined
        : value.accuracyM === undefined
    )
    .refine(
      (value) => (value.address === undefined) === (value.city === undefined)
    ),
  z
    .object({
      action: z.literal("decideLocation"),
      proposalId: z.uuid(),
      approved: z.boolean(),
      reason: z.string().trim().max(1000).optional(),
    })
    .refine(
      (value) => value.approved || Boolean(value.reason?.trim()),
      "Indicá el motivo del rechazo"
    ),
]);

export const visitDayResultSchema = z.object({
  visits: z.array(
    z.object({
      id: z.uuid(),
      customerId: z.uuid(),
      customerName: z.string(),
      checkedInAt: z.string().nullable(),
      method: z.enum(["gps", "manual"]).nullable(),
      reviewStatus: z.enum(["not_visited", "pending", "confirmed", "rejected"]),
      hasLocation: z.boolean(),
      siteId: z.uuid().nullable().optional(),
      siteName: z.string().nullable().optional(),
      siteAddress: z.string().nullable().optional(),
    })
  ),
  customers: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      sites: z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            address: z.string(),
            city: z.string(),
          })
        )
        .default([]),
    })
  ),
});

export const routeDayResultSchema = z.object({
  routes: z.array(
    z.object({
      id: z.uuid(),
      number: z.number().int().positive(),
      status: z.enum(["open", "closed"]),
      closedAt: z.string().nullable(),
      visits: z.array(
        visitDayResultSchema.shape.visits.element.extend({
          plannedPosition: z.number().int().positive(),
          skipReason: z.string().nullable(),
          correctedAt: z.string().nullable(),
          correctionReason: z.string().nullable(),
          hasPendingLocation: z.boolean().default(false),
        })
      ),
      events: z.array(
        z.object({
          action: z.enum([
            "created",
            "reordered",
            "closed",
            "reopened",
            "corrected",
          ]),
          actorId: z.uuid(),
          actorName: z.string().optional(),
          createdAt: z.string(),
          details: z.record(z.string(), z.unknown()),
        })
      ),
    })
  ),
  customers: visitDayResultSchema.shape.customers,
});

export type RouteDayResult = z.infer<typeof routeDayResultSchema>;

export const routeAdminListSchema = z.array(
  z.object({
    id: z.uuid(),
    sellerId: z.uuid(),
    sellerName: z.string(),
    day: z.string(),
    number: z.number().int().positive(),
    status: z.enum(["open", "closed"]),
  })
);

export const reviewQueueSchema = z.object({
  monthlyMetrics: z.array(
    z.object({
      sellerId: z.uuid(),
      sellerName: z.string(),
      month: z.string(),
      visits: z.number().int(),
      confirmed: z.number().int(),
      manual: z.number().int(),
    })
  ),
  dayOverview: z.array(
    z.object({
      id: z.uuid(),
      sellerId: z.uuid(),
      sellerName: z.string(),
      customerName: z.string(),
      visitDate: z.string(),
      checkedInAt: z.string().nullable(),
      reviewStatus: z.enum(["not_visited", "pending", "confirmed", "rejected"]),
      siteName: z.string().nullable().optional(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    })
  ),
  visits: z.array(
    z.object({
      id: z.uuid(),
      sellerId: z.uuid(),
      sellerName: z.string(),
      customerName: z.string(),
      checkedInAt: z.string(),
      method: z.enum(["gps", "manual"]),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      accuracyM: z.number().nullable(),
      distanceM: z.number().nullable(),
      siteName: z.string().nullable().optional(),
    })
  ),
  locations: z.array(
    z.object({
      proposalId: z.uuid(),
      visitId: z.uuid(),
      customerId: z.uuid(),
      customerName: z.string(),
      siteName: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      latitude: z.number(),
      longitude: z.number(),
      accuracyM: z.number().nullable(),
      method: z.enum(["gps", "pin"]),
    })
  ),
});

export const visitAdminDaySchema = reviewQueueSchema.shape.visits;

export const customerSiteSchema = z.object({
  id: z.uuid(),
  customerId: z.uuid(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  notes: z.string().nullable(),
  active: z.boolean(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export const customerSitesSchema = z.array(customerSiteSchema);
export type CustomerSite = z.infer<typeof customerSiteSchema>;

export const saveCustomerSiteSchema = z
  .object({
    action: z.literal("saveSite"),
    customerId: z.uuid(),
    siteId: z.uuid().optional(),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1000).optional(),
    active: z.boolean(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
  })
  .refine(
    (value) => (value.latitude === null) === (value.longitude === null),
    "Latitud y longitud deben ingresarse juntas"
  );

export const visitDocumentCandidatesSchema = z.object({
  quotes: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      total: z.number(),
      createdAt: z.string(),
      linkedVisitId: z.uuid().nullable(),
      salesOrderId: z.uuid().nullable(),
    })
  ),
  orders: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      total: z.number(),
      createdAt: z.string().nullable(),
      linkedVisitId: z.uuid().nullable(),
    })
  ),
});

export const visitDocumentHistorySchema = z.object({
  opportunities: z.number().int().nonnegative(),
  visit: z.object({
    routeId: z.uuid(),
    checkedInAt: z.string().nullable(),
    method: z.enum(["gps", "manual"]).nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    accuracyM: z.number().nullable(),
    correctionReason: z.string().nullable(),
    correctedAt: z.string().nullable(),
    skipReason: z.string().nullable(),
    noDocumentsAtCheckin: z.boolean().nullable(),
    siteName: z.string().nullable().optional(),
  }),
  links: z.array(
    z.object({
      type: z.enum(["quote", "pre_sale"]),
      id: z.uuid(),
      status: z.string(),
      origin: z.enum(["selected", "later", "quote_conversion", "quote_move"]),
      linkedAt: z.string(),
      linkedBy: z.uuid(),
      salesOrderId: z.uuid().nullable(),
    })
  ),
  events: z.array(
    z.object({
      type: z.enum(["quote", "pre_sale"]),
      id: z.uuid(),
      action: z.enum(["linked", "moved", "inherited"]),
      actorId: z.uuid(),
      actorName: z.string().optional(),
      fromVisitId: z.uuid().nullable(),
      toVisitId: z.uuid(),
      createdAt: z.string(),
    })
  ),
});

export type VisitDocumentCandidates = z.infer<
  typeof visitDocumentCandidatesSchema
>;
export type VisitDocumentHistory = z.infer<typeof visitDocumentHistorySchema>;

export type VisitDayResult = z.infer<typeof visitDayResultSchema>;
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;
