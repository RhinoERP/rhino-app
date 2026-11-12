import { z } from "zod";
import { sellerOfflineSnapshotV1Schema } from "./seller-offline-snapshot";

export const offlineSalesQuoteCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    orgSlug: z.string().min(1).max(100),
    signature: z.string().min(1).max(4096),
    snapshot: sellerOfflineSnapshotV1Schema,
    quote: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();

export const storedOfflineSalesQuoteCommandSchema = z
  .object({
    command: offlineSalesQuoteCommandSchema,
    status: z.enum([
      "queued",
      "syncing",
      "synced",
      "requires-review",
      "failed",
    ]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    attempts: z.number().int().nonnegative(),
    requestId: z.string().uuid().nullable(),
    snapshotExpired: z.boolean().default(false),
    historicalCostMissing: z.boolean().default(false),
    lastError: z.string().max(500).nullable(),
  })
  .strict();

export type OfflineSalesQuoteCommand = z.infer<
  typeof offlineSalesQuoteCommandSchema
>;
export type StoredOfflineSalesQuoteCommand = z.infer<
  typeof storedOfflineSalesQuoteCommandSchema
>;
