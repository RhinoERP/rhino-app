import { z } from "zod";
import {
  commercialChangeSchema,
  offlineCommandV1Schema,
} from "./offline-command";

export const offlineCommandStatusSchema = z.enum([
  "queued",
  "syncing",
  "requires-review",
  "failed",
  "synced",
]);

export const storedOfflineCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    draftId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    status: offlineCommandStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastAttemptAt: z.string().datetime().nullable(),
    nextAttemptAt: z.string().datetime().nullable(),
    resourceId: z.string().uuid().nullable(),
    lastError: z
      .object({
        code: z.enum([
          "AUTH_REQUIRED",
          "FORBIDDEN",
          "VALIDATION_ERROR",
          "STALE_REFERENCE",
          "REVIEW_REQUIRED",
          "RETRYABLE",
        ]),
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
        changes: z.array(commercialChangeSchema).optional(),
      })
      .strict()
      .nullable(),
    command: offlineCommandV1Schema,
  })
  .strict();

export type OfflineCommandStatus = z.infer<typeof offlineCommandStatusSchema>;
export type StoredOfflineCommand = z.infer<typeof storedOfflineCommandSchema>;
